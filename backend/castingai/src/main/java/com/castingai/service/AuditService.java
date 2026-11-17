package com.castingai.service;

import com.castingai.entity.User;
import com.castingai.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/** T-099 · Journal d'audit : chaque action sensible de l'administration est enregistrée. */
@Service
@RequiredArgsConstructor
public class AuditService {

    private final JdbcTemplate jdbc;
    private final UserRepository users;

    public record Entry(UUID id, String actor, String action, String target, String details, long createdAt) {}

    private static final String MS = "(extract(epoch from (created_at at time zone current_setting('TimeZone'))) * 1000)::bigint";

    /** Enregistre une action faite par l'utilisateur connecté. */
    public void log(String action, String target, String details) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String email = auth == null ? null : auth.getName();
        User u = email == null ? null : users.findByEmail(email).orElse(null);
        String label = u == null ? (email == null ? "Système" : email)
                : (u.getFirstName() + " " + u.getLastName()).trim() + " (" + u.getEmail() + ")";
        jdbc.update("insert into audit_log (id, actor_id, actor_label, action, target, details) values (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), u == null ? null : u.getId(), cut(label, 200), action, cut(target, 200), cut(details, 1000));
    }

    public List<Entry> recent(String action, int limit) {
        int n = Math.max(1, Math.min(limit, 500));
        String where = action == null || action.isBlank() ? "" : " where action = ?";
        Object[] args = where.isEmpty() ? new Object[]{ n } : new Object[]{ action, n };
        return jdbc.query("select id, actor_label, action, target, details, " + MS + " from audit_log" + where
                        + " order by created_at desc limit ?",
                (rs, i) -> new Entry((UUID) rs.getObject(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getLong(6)),
                args);
    }

    private static String cut(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
