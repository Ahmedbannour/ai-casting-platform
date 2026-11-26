package com.castingai.service;

import com.castingai.dto.auth.AuthResponse;
import com.castingai.entity.Actor;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.ConflictException;
import com.castingai.exception.ForbiddenException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.ActorRepository;
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
import java.util.regex.Pattern;

/**
 * T-102 · Invitation d'un acteur dont la fiche a été saisie ou importée par une agence.
 * Lien à usage unique, valable {@value #DAYS} jours ; un nouveau lien annule le précédent.
 * En acceptant, l'acteur crée son compte, reprend sa fiche, donne son accord (T-101)
 * et choisit : rester privé chez son agence ou rejoindre le vivier commun.
 */
@Service
@RequiredArgsConstructor
public class InvitationService {

    public static final int DAYS = 14;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$");

    private final JdbcTemplate jdbc;
    private final ActorRepository actors;
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final ConsentService consents;
    private final AuthServiceImpl auth;
    private final AuditService audit;

    /** État de l'invitation vu par l'agence. */
    public record Status(boolean hasAccount, boolean canInvite, Long pendingUntil, Long usedAt, String reason) {}
    /** Lien créé : le jeton n'est montré qu'une fois. */
    public record Created(String token, long expiresAt) {}
    /** Ce que voit l'acteur en ouvrant le lien (aucune donnée sensible). */
    public record Preview(String firstName, String agencyName, String email, boolean agencyActor, long expiresAt) {}
    public record AcceptRequest(String email, String password, Boolean acceptTerms, String age, String guardianName, Boolean joinPool) {}

    // ───────────────────────── côté agence ─────────────────────────

    @Transactional(readOnly = true)
    public Status status(UUID actorId, User me) {
        Actor a = actorFor(actorId, me);
        if (a.getAccount() != null) return new Status(true, false, null, usedAt(actorId), "L'acteur a déjà son compte.");
        Long pending = jdbc.query("select expires_at from actor_invitations where actor_id = ? and used_at is null and revoked_at is null and expires_at > now() order by created_at desc limit 1",
                rs -> rs.next() ? rs.getTimestamp(1).getTime() : null, actorId);
        return new Status(false, true, pending, null, null);
    }

    @Transactional
    public Created create(UUID actorId, User me) {
        Actor a = actorFor(actorId, me);
        if (a.getAccount() != null) throw new ConflictException("Cet acteur a déjà son compte : inutile de l'inviter.");
        jdbc.update("update actor_invitations set revoked_at = now() where actor_id = ? and used_at is null and revoked_at is null", actorId);
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        LocalDateTime exp = LocalDateTime.now().plusDays(DAYS);
        jdbc.update("insert into actor_invitations (id, actor_id, agency_id, token_hash, created_by, expires_at) values (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), actorId, a.getAgencyId(), hash(token), me.getId(), Timestamp.valueOf(exp));
        audit.log("INVITATION_ACTEUR", a.getFirstName() + " " + a.getLastName(), "Lien d'invitation valable " + DAYS + " jours");
        return new Created(token, Timestamp.valueOf(exp).getTime());
    }

    /** Annule le lien en cours (par exemple envoyé à la mauvaise personne). */
    @Transactional
    public void revoke(UUID actorId, User me) {
        Actor a = actorFor(actorId, me);
        int n = jdbc.update("update actor_invitations set revoked_at = now() where actor_id = ? and used_at is null and revoked_at is null", actorId);
        if (n > 0) audit.log("INVITATION_ANNULEE", a.getFirstName() + " " + a.getLastName(), null);
    }

    // ───────────────────────── côté acteur (public) ─────────────────────────

    @Transactional(readOnly = true)
    public Preview preview(String token) {
        Map<String, Object> inv = valid(token);
        Actor a = actors.findById((UUID) inv.get("actor_id")).orElseThrow(this::invalid);
        String agency = a.getAgencyId() == null ? null
                : jdbc.query("select name from agencies where id = ?", rs -> rs.next() ? rs.getString(1) : null, a.getAgencyId());
        return new Preview(a.getFirstName(), agency, a.getEmail(), a.getAgencyId() != null, ((Timestamp) inv.get("expires_at")).getTime());
    }

    @Transactional
    public AuthResponse accept(String token, AcceptRequest r) {
        Map<String, Object> inv = valid(token);
        var consent = new ConsentService.Request(r.acceptTerms(), r.age(), r.guardianName());
        ConsentService.validate(consent);
        if (r.password() == null || r.password().length() < 8 || r.password().length() > 100)
            throw new IllegalArgumentException("Choisissez un mot de passe de 8 caractères au moins.");
        Actor a = actors.findById((UUID) inv.get("actor_id")).orElseThrow(this::invalid);
        if (a.getAccount() != null) throw invalid();
        String email = (r.email() == null || r.email().isBlank() ? a.getEmail() : r.email()).trim().toLowerCase();
        if (email == null || email.isBlank() || email.length() > 160 || !EMAIL.matcher(email).matches())
            throw new IllegalArgumentException("Indiquez une adresse e-mail valide.");
        if (users.existsByEmail(email))
            throw new ConflictException("Un compte existe déjà avec cette adresse e-mail : connectez-vous, puis demandez à votre agence de relier votre fiche.");

        User user = User.builder().email(email).password(passwordEncoder.encode(r.password()))
                .firstName(a.getFirstName()).lastName(a.getLastName()).role(Role.ACTEUR).enabled(true).build();
        users.saveAndFlush(user);
        a.setAccount(user);
        if (a.getEmail() == null || a.getEmail().isBlank()) a.setEmail(email);
        if (Boolean.TRUE.equals(r.joinPool()) && a.getAgencyId() != null) {
            a.setOriginAgencyId(a.getAgencyId());   // l'agence garde l'accès direct aux coordonnées
            a.setAgencyId(null);                     // la fiche rejoint le vivier commun
        }
        actors.saveAndFlush(a);
        consents.record(user.getId(), consent, "INVITATION");
        jdbc.update("update actor_invitations set used_at = now() where id = ?", inv.get("id"));
        jdbc.update("insert into audit_log (id, actor_id, actor_label, action, target, details) values (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), user.getId(), (a.getFirstName() + " " + a.getLastName() + " (" + email + ")"),
                "INVITATION_ACCEPTEE", a.getFirstName() + " " + a.getLastName(),
                Boolean.TRUE.equals(r.joinPool()) && a.getOriginAgencyId() != null ? "Fiche passée au vivier commun" : "Fiche gardée chez l'agence");
        return auth.buildAuthResponse(user);
    }

    // ───────────────────────── outils ─────────────────────────

    /** Fiche que l'utilisateur peut inviter : administrateur, ou agent de l'agence qui a apporté la fiche. */
    private Actor actorFor(UUID actorId, User me) {
        Actor a = actors.findById(actorId).orElseThrow(() -> new ResourceNotFoundException("Acteur introuvable"));
        if (me.getRole() == Role.ADMIN) return a;
        UUID mine = me.getAgency() == null ? null : me.getAgency().getId();
        boolean own = mine != null && (mine.equals(a.getAgencyId()) || mine.equals(a.getOriginAgencyId()));
        if (!own) throw new ForbiddenException("Seule l'agence qui a apporté cette fiche peut inviter l'acteur.");
        return a;
    }

    private Map<String, Object> valid(String token) {
        if (token == null || token.length() < 20 || token.length() > 100) throw invalid();
        var rows = jdbc.queryForList("select id, actor_id, expires_at from actor_invitations where token_hash = ? and used_at is null and revoked_at is null and expires_at > now()", hash(token));
        if (rows.isEmpty()) throw invalid();
        return rows.get(0);
    }

    private Long usedAt(UUID actorId) {
        return jdbc.query("select max(used_at) from actor_invitations where actor_id = ?",
                rs -> rs.next() && rs.getTimestamp(1) != null ? rs.getTimestamp(1).getTime() : null, actorId);
    }

    private ResourceNotFoundException invalid() {
        return new ResourceNotFoundException("Ce lien d'invitation n'est plus valable : il a déjà servi, a expiré ou a été remplacé. Demandez un nouveau lien à votre agence.");
    }

    public static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
