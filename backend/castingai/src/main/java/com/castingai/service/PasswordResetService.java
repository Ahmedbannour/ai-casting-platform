package com.castingai.service;

import com.castingai.entity.User;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.RefreshTokenRepository;
import com.castingai.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

/**
 * T-112 · Mot de passe oublié (D-011, sans envoi d'e-mail) : l'administrateur crée un lien à usage unique,
 * valable une heure, et le transmet à la personne. Un nouveau lien annule le précédent.
 * Le nouveau mot de passe ferme toutes les sessions ouvertes du compte.
 */
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    public static final int MINUTES = 60;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordEncoder passwordEncoder;
    private final AuditService audit;

    public record Created(String token, long expiresAt) {}
    public record Preview(String firstName, String email, long expiresAt) {}

    @Transactional
    public Created create(UUID userId) {
        User u = users.findById(userId).orElseThrow(() -> new ResourceNotFoundException("Compte introuvable"));
        jdbc.update("update password_resets set revoked_at = now() where user_id = ? and used_at is null and revoked_at is null", userId);
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        LocalDateTime exp = LocalDateTime.now().plusMinutes(MINUTES);
        UUID admin = currentAdminId();
        jdbc.update("insert into password_resets (id, user_id, token_hash, created_by, expires_at) values (?, ?, ?, ?, ?)",
                UUID.randomUUID(), userId, hash(token), admin, Timestamp.valueOf(exp));
        audit.log("LIEN_REINITIALISATION", u.getFirstName() + " " + u.getLastName() + " (" + u.getEmail() + ")", "Valable " + MINUTES + " minutes");
        return new Created(token, Timestamp.valueOf(exp).getTime());
    }

    @Transactional(readOnly = true)
    public Preview preview(String token) {
        Map<String, Object> r = valid(token);
        User u = users.findById((UUID) r.get("user_id")).orElseThrow(this::invalid);
        return new Preview(u.getFirstName(), mask(u.getEmail()), ((Timestamp) r.get("expires_at")).getTime());
    }

    @Transactional
    public void reset(String token, String password) {
        Map<String, Object> r = valid(token);
        if (password == null || password.length() < 8 || password.length() > 100)
            throw new IllegalArgumentException("Choisissez un mot de passe de 8 caractères au moins.");
        User u = users.findById((UUID) r.get("user_id")).orElseThrow(this::invalid);
        u.setPassword(passwordEncoder.encode(password));
        users.saveAndFlush(u);
        jdbc.update("update password_resets set used_at = now() where id = ?", r.get("id"));
        refreshTokens.deleteByUser(u);                         // les autres appareils sont déconnectés
        jdbc.update("insert into audit_log (id, actor_id, actor_label, action, target, details) values (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), u.getId(), (u.getFirstName() + " " + u.getLastName() + " (" + u.getEmail() + ")"),
                "MOT_DE_PASSE_REINITIALISE", u.getEmail(), "Sessions ouvertes fermées");
    }

    private Map<String, Object> valid(String token) {
        if (token == null || token.length() < 20 || token.length() > 100) throw invalid();
        var rows = jdbc.queryForList("select id, user_id, expires_at from password_resets where token_hash = ? and used_at is null and revoked_at is null and expires_at > now()", hash(token));
        if (rows.isEmpty()) throw invalid();
        return rows.get(0);
    }

    private UUID currentAdminId() {
        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        return auth == null ? null : users.findByEmail(auth.getName()).map(User::getId).orElse(null);
    }

    private ResourceNotFoundException invalid() {
        return new ResourceNotFoundException("Ce lien n'est plus valable : il a déjà servi, a expiré (1 heure) ou a été remplacé. Demandez un nouveau lien à votre administrateur.");
    }

    /** a****@domaine.tn : la personne reconnaît son compte sans que l'adresse complète soit affichée. */
    static String mask(String email) {
        int at = email == null ? -1 : email.indexOf('@');
        if (at < 1) return "";
        return email.charAt(0) + "*".repeat(Math.max(1, Math.min(at - 1, 6))) + email.substring(at);
    }

    static String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
