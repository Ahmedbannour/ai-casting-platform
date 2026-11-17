package com.castingai.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Formulaire de contact de la vitrine : messages enregistrés en base et lus dans l'Administration.
 * Protections simples et gratuites : champ piège invisible pour les robots, 5 messages par heure et par adresse IP.
 */
@Service
@RequiredArgsConstructor
public class ContactMessageService {

    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$");
    private static final int MAX_PER_HOUR = 5;

    private final JdbcTemplate jdbc;
    private final Map<String, long[]> recent = new ConcurrentHashMap<>();

    public record Request(String name, String email, String organisation, String profile, String message, String website) {}
    public record Message(UUID id, String name, String email, String organisation, String profile, String message, long createdAt, boolean read) {}

    public void submit(Request r, String ip) {
        if (r == null) throw new IllegalArgumentException("Message vide.");
        if (r.website() != null && !r.website().isBlank()) return;           // robot : on ne dit rien, on n'enregistre rien
        String name = trim(r.name()), email = trim(r.email()), msg = trim(r.message()), org = trim(r.organisation());
        String profile = r.profile() == null ? "AUTRE" : r.profile();
        if (name.length() < 2 || name.length() > 120) throw new IllegalArgumentException("Indiquez votre nom.");
        if (email.length() > 160 || !EMAIL.matcher(email).matches()) throw new IllegalArgumentException("Indiquez une adresse e-mail valide.");
        if (!List.of("AGENCE", "ACTEUR", "AUTRE").contains(profile)) throw new IllegalArgumentException("Profil inconnu.");
        if (msg.length() < 10) throw new IllegalArgumentException("Écrivez votre message (10 caractères au moins).");
        if (msg.length() > 2000) throw new IllegalArgumentException("Message trop long (2 000 caractères au plus).");
        if (org.length() > 160) throw new IllegalArgumentException("Nom de structure trop long.");
        limit(ip);
        jdbc.update("insert into contact_messages (id, name, email, organisation, profile, message, ip) values (?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), name, email.toLowerCase(), org.isEmpty() ? null : org, profile, msg, ip);
    }

    public List<Message> list(int limit) {
        return jdbc.query("select id, name, email, organisation, profile, message, " +
                        "(extract(epoch from (created_at at time zone current_setting('TimeZone'))) * 1000)::bigint as ms, read_at is not null as rd " +
                        "from contact_messages order by created_at desc limit ?",
                (rs, i) -> new Message((UUID) rs.getObject("id"), rs.getString("name"), rs.getString("email"), rs.getString("organisation"),
                        rs.getString("profile"), rs.getString("message"), rs.getLong("ms"), rs.getBoolean("rd")),
                Math.max(1, Math.min(limit, 200)));
    }

    public int unread() {
        Integer n = jdbc.queryForObject("select count(*) from contact_messages where read_at is null", Integer.class);
        return n == null ? 0 : n;
    }

    public void markRead(UUID id) { jdbc.update("update contact_messages set read_at = coalesce(read_at, now()) where id = ?", id); }

    private void limit(String ip) {
        long now = System.currentTimeMillis();
        long[] w = recent.compute(ip == null ? "?" : ip, (k, v) -> v == null || now - v[0] > 3_600_000L ? new long[] { now, 0 } : v);
        synchronized (w) {
            if (w[1] >= MAX_PER_HOUR)
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Trop de messages envoyés. Réessayez dans une heure.");
            w[1]++;
        }
    }

    private static String trim(String s) { return s == null ? "" : s.trim(); }
}
