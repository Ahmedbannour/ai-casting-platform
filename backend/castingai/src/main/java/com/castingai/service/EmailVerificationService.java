package com.castingai.service;

import com.castingai.entity.User;
import com.castingai.exception.ConflictException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
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
 * T-113 · Vérification de l'adresse e-mail sans envoi d'e-mail (D-013) : l'administrateur crée un lien
 * à usage unique, valable {@value #DAYS} jours, et le transmet ; l'ouvrir confirme l'adresse.
 * Les comptes Google et Facebook sont vérifiés d'office (le fournisseur garantit l'adresse).
 */
@Service
@RequiredArgsConstructor
public class EmailVerificationService {

    public static final int DAYS = 7;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final AuditService audit;

    public record Created(String token, long expiresAt) {}
    public record Result(String firstName, String email) {}
    public record Status(String email, boolean verified, String provider) {}

    public static boolean verified(User u) { return u.getEmailVerifiedAt() != null || !"LOCAL".equals(u.getAuthProvider()); }

    @Transactional
    public Created create(UUID userId) {
        User u = users.findById(userId).orElseThrow(() -> new ResourceNotFoundException("Compte introuvable"));
        if (verified(u)) throw new ConflictException("Cette adresse e-mail est déjà vérifiée.");
        jdbc.update("update email_verifications set revoked_at = now() where user_id = ? and used_at is null and revoked_at is null", userId);
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        LocalDateTime exp = LocalDateTime.now().plusDays(DAYS);
        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        UUID admin = auth == null ? null : users.findByEmail(auth.getName()).map(User::getId).orElse(null);
        jdbc.update("insert into email_verifications (id, user_id, token_hash, created_by, expires_at) values (?, ?, ?, ?, ?)",
                UUID.randomUUID(), userId, PasswordResetService.hash(token), admin, Timestamp.valueOf(exp));
        audit.log("LIEN_VERIFICATION_EMAIL", u.getFirstName() + " " + u.getLastName() + " (" + u.getEmail() + ")", "Valable " + DAYS + " jours");
        return new Created(token, Timestamp.valueOf(exp).getTime());
    }

    /** Ouvrir le lien vérifie l'adresse (une seule fois). */
    @Transactional
    public Result confirm(String token) {
        if (token == null || token.length() < 20 || token.length() > 100) throw invalid();
        var rows = jdbc.queryForList("select id, user_id from email_verifications where token_hash = ? and used_at is null and revoked_at is null and expires_at > now()",
                PasswordResetService.hash(token));
        if (rows.isEmpty()) throw invalid();
        Map<String, Object> r = rows.get(0);
        User u = users.findById((UUID) r.get("user_id")).orElseThrow(this::invalid);
        u.setEmailVerifiedAt(LocalDateTime.now());
        users.saveAndFlush(u);
        jdbc.update("update email_verifications set used_at = now() where id = ?", r.get("id"));
        jdbc.update("insert into audit_log (id, actor_id, actor_label, action, target, details) values (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), u.getId(), (u.getFirstName() + " " + u.getLastName() + " (" + u.getEmail() + ")"),
                "EMAIL_VERIFIE", u.getEmail(), null);
        return new Result(u.getFirstName(), PasswordResetService.mask(u.getEmail()));
    }

    public Status status(User u) { return new Status(u.getEmail(), verified(u), u.getAuthProvider()); }

    private ResourceNotFoundException invalid() {
        return new ResourceNotFoundException("Ce lien de vérification n'est plus valable : il a déjà servi, a expiré ou a été remplacé. Demandez un nouveau lien à votre administrateur.");
    }
}
