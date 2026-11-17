package com.castingai.service;

import com.castingai.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** T-096 · Notifications dans l'application. */
@Service
@RequiredArgsConstructor
public class NotificationService {

    private final JdbcTemplate jdbc;
    private final AccessService access;
    private final PlatformStatsService stats;

    public record Item(String id, String kind, String title, String body, String link, long createdAt, boolean read) {}
    public record Feed(int unread, List<Item> items) {}

    private static final String MS = "(extract(epoch from (created_at at time zone current_setting('TimeZone'))) * 1000)::bigint";

    /** Ajoute une notification ; sans destinataire, ne fait rien. */
    public void push(UUID userId, String kind, String title, String body, String link) {
        if (userId == null) return;
        jdbc.update("insert into notifications (id, user_id, kind, title, body, link) values (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), userId, kind, cut(title, 160), cut(body, 400), cut(link, 200));
    }

    @Transactional(readOnly = true)
    public Feed feed(String email) {
        User me = access.user(email);
        List<Item> items = new ArrayList<>();
        // Échéance du contrat de l'agence : rappel calculé, non stocké
        if (me.getAgency() != null && me.getAgency().getContractEnd() != null) {
            long days = ChronoUnit.DAYS.between(LocalDate.now(), me.getAgency().getContractEnd());
            if (days >= 0 && days <= 30) {
                items.add(new Item("contrat", "CONTRAT", "Votre contrat se termine dans " + days + " jour" + (days > 1 ? "s" : ""),
                        "Contactez la plateforme pour le renouveler et garder l'accès complet.", null, System.currentTimeMillis(), false));
            }
        }
        // Administrateur : contrats d'agences à renouveler sous 30 jours (T-098)
        if (me.getRole() == com.castingai.entity.Role.ADMIN) {
            for (PlatformStatsService.Renewal r : stats.renewals()) {
                items.add(new Item("renouvellement-" + r.id(), "CONTRAT",
                        "Contrat de " + r.name() + " : fin dans " + r.daysLeft() + " jour" + (r.daysLeft() > 1 ? "s" : ""),
                        r.monthlyAmount() == null ? "Montant mensuel non renseigné." : "Revenu concerné : " + r.monthlyAmount().stripTrailingZeros().toPlainString() + " " + r.currency() + " par mois.",
                        "/admin", System.currentTimeMillis(), false));
            }
        }
        items.addAll(jdbc.query("select id, kind, title, body, link, " + MS + ", read_at is not null from notifications "
                        + "where user_id = ? order by created_at desc limit 30",
                (rs, i) -> new Item(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
                        rs.getLong(6), rs.getBoolean(7)), me.getId()));
        int unread = (int) items.stream().filter(it -> !it.read()).count();
        return new Feed(unread, items);
    }

    @Transactional
    public void readAll(String email) {
        jdbc.update("update notifications set read_at = now() where user_id = ? and read_at is null", access.user(email).getId());
    }

    @Transactional
    public void read(String email, UUID id) {
        jdbc.update("update notifications set read_at = now() where id = ? and user_id = ? and read_at is null", id, access.user(email).getId());
    }

    private static String cut(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
