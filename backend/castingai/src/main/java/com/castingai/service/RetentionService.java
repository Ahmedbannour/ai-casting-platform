package com.castingai.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * T-111 · Durées de conservation et purge automatique (chaque nuit à 3 h 30, et à la demande de l'administrateur).
 * Les durées sont celles annoncées dans la politique de confidentialité.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RetentionService {

    /** Une règle : quoi, combien de temps, et la requête qui efface ce qui a dépassé la durée. */
    public record Rule(String key, String label, String duration, String sql) {}
    public record Report(LocalDateTime at, String trigger, Map<String, Integer> deleted, int total) {}

    public static final List<Rule> RULES = List.of(
            new Rule("audit", "Journal d'administration et de sécurité", "12 mois",
                    "delete from audit_log where created_at < now() - interval '12 months'"),
            new Rule("consultations", "Consultations des coordonnées des acteurs", "12 mois",
                    "delete from contact_views where viewed_at < now() - interval '12 months'"),
            new Rule("notifications", "Notifications", "6 mois",
                    "delete from notifications where created_at < now() - interval '6 months'"),
            new Rule("contact", "Messages du formulaire de contact", "12 mois",
                    "delete from contact_messages where created_at < now() - interval '12 months'"),
            new Rule("recherches", "Historique des recherches des agents", "12 mois",
                    "delete from search_history where created_at < now() - interval '12 months'"),
            new Rule("sessions", "Sessions expirées", "dès l'expiration",
                    "delete from refresh_tokens where expires_at < now()"),
            new Rule("liens", "Liens à usage unique (mot de passe, vérification, invitation) utilisés, annulés ou expirés", "30 jours",
                    "delete from password_resets where coalesce(used_at, revoked_at, expires_at) < now() - interval '30 days'; "
                  + "delete from email_verifications where coalesce(used_at, revoked_at, expires_at) < now() - interval '30 days'; "
                  + "delete from actor_invitations where coalesce(used_at, revoked_at, expires_at) < now() - interval '30 days'"));

    private final JdbcTemplate jdbc;
    private volatile Report last;

    @Scheduled(cron = "0 30 3 * * *")
    public void nightly() {
        try { run("Purge automatique de la nuit"); } catch (Exception e) { log.error("Purge de conservation en échec", e); }
    }

    @Transactional
    public Report run(String trigger) {
        Map<String, Integer> deleted = new LinkedHashMap<>();
        int total = 0;
        for (Rule r : RULES) {
            int n = 0;
            for (String sql : r.sql().split(";\\s*")) if (!sql.isBlank()) n += jdbc.update(sql);
            deleted.put(r.key(), n);
            total += n;
        }
        if (total > 0) {
            jdbc.update("insert into audit_log (id, actor_id, actor_label, action, target, details) values (?, null, ?, ?, ?, ?)",
                    UUID.randomUUID(), "Système", "PURGE_CONSERVATION", trigger, total + " ligne(s) effacée(s) : " + deleted);
        }
        last = new Report(LocalDateTime.now(), trigger, deleted, total);
        log.info("Conservation : {} ligne(s) effacée(s) {}", total, deleted);
        return last;
    }

    public Report last() { return last; }
}
