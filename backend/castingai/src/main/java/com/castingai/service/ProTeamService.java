package com.castingai.service;

import com.castingai.dto.auth.AuthResponse;
import com.castingai.entity.AdEvent;
import com.castingai.entity.AdRequest;
import com.castingai.entity.Agency;
import com.castingai.entity.Project;
import com.castingai.entity.ProjectMember;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.ConflictException;
import com.castingai.exception.ForbiddenException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.AdEventRepository;
import com.castingai.repository.AdRequestRepository;
import com.castingai.repository.AgencyRepository;
import com.castingai.repository.ProjectMemberRepository;
import com.castingai.repository.ProjectRepository;
import com.castingai.repository.UserRepository;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Le producer mène le projet : il invite la marque et l'agence marketing d'une publicité, et ses assistantes de production,
 * à qui il donne des autorisations. Déjà inscrit : rattaché tout de suite. Pas encore inscrit : un lien à usage unique
 * ({@value #DAYS} jours) qu'il envoie lui-même (e-mail, WhatsApp) ; en l'ouvrant, l'invité crée son compte en trois étapes.
 */
@Service
@RequiredArgsConstructor
public class ProTeamService {

    public static final int DAYS = 14;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final List<String> KINDS = List.of("MARQUE", "AGENCE_MARKETING");

    private final JdbcTemplate jdbc;
    private final AccessService access;
    private final UserRepository users;
    private final AgencyRepository agencies;
    private final AdRequestRepository requests;
    private final AdEventRepository events;
    private final PasswordEncoder encoder;
    private final ConsentService consents;
    private final AuthServiceImpl auth;
    private final AuditService audit;
    private final NotificationService notifications;
    private final RoomService rooms;
    private final ProjectRepository projects;
    private final ProjectMemberRepository members;

    public record Invite(@NotBlank(message = "Indiquez l'adresse e-mail") @Email(message = "Adresse e-mail invalide") @Size(max = 160) String email,
                         String kind) {}
    public record AssistantInvite(@NotBlank(message = "Indiquez l'adresse e-mail") @Email(message = "Adresse e-mail invalide") @Size(max = 160) String email,
                                  List<String> perms) {}
    public record AssistantUpdate(List<String> perms, Boolean enabled) {}
    /** RATTACHE : compte existant rattaché ; LIEN : lien à envoyer (le jeton n'est montré qu'une fois). */
    public record Result(String status, String token, Long expiresAt, String name, String message) {}
    public record InvitationView(UUID id, String email, String kind, UUID requestId, String requestTitle, long expiresAt, List<String> perms) {}
    public record AssistantView(UUID id, String name, String email, boolean enabled, List<String> perms) {}
    public record Team(List<AssistantView> assistants, List<InvitationView> pending, List<String> allPerms) {}
    public record Preview(String kind, String email, String productionName, String inviterName, String requestTitle,
                          String joinOrg, boolean needsOrg, List<String> perms, long expiresAt, UUID roomId) {}
    /** Le chef de room invite par e-mail ; sans compte, il précise le rôle de la personne (réalisateur, marque, agence). */
    public record RoomInvite(@NotBlank(message = "Indiquez l'adresse e-mail") @Email(message = "Adresse e-mail invalide") @Size(max = 160) String email,
                             String kind) {}
    private static final List<String> ROOM_KINDS = List.of("REALISATEUR", "MARQUE", "AGENCE_MARKETING");
    public record Accept(@NotBlank(message = "Le prénom est obligatoire") @Size(max = 80) String firstName,
                         @NotBlank(message = "Le nom est obligatoire") @Size(max = 80) String lastName,
                         @Size(max = 160) String organisation, @Size(max = 100) String city,
                         @NotBlank(message = "Choisissez un mot de passe") @Size(min = 8, max = 100, message = "Mot de passe : 8 caractères au moins") String password,
                         Boolean acceptTerms) {}

    // ───────── Publicité : inviter la marque et l'agence ─────────

    @Transactional
    public Result inviteToRequest(String email, UUID requestId, Invite req) {
        User me = access.user(email);
        AdRequest r = inviting(me, requestId);
        String kind = req.kind() == null ? "" : req.kind().trim().toUpperCase(Locale.ROOT);
        if (!KINDS.contains(kind)) throw new IllegalArgumentException("Invitez une marque ou une agence marketing");
        String mail = norm(req.email());
        Agency current = "MARQUE".equals(kind) ? r.getBrand() : r.getAgency();
        if ("AGENCE_MARKETING".equals(kind) && current != null && r.getStatus() != AdRequest.Status.BROUILLON)
            throw new IllegalArgumentException("L'agence a déjà reçu la V0 : elle ne se remplace plus");

        Optional<User> existing = users.findByEmail(mail);
        if (existing.isPresent()) {
            User u = existing.get();
            if (u.getRole() != Role.valueOf(kind) || u.getAgency() == null || !u.isEnabled())
                throw new IllegalArgumentException("Cette adresse appartient déjà à un compte " + label(u.getRole()) + " : invitez l'adresse de la " + label(Role.valueOf(kind)).toLowerCase(Locale.ROOT));
            if (current != null && !current.getId().equals(u.getAgency().getId()))
                throw new ConflictException(current.getName() + " est déjà " + ("MARQUE".equals(kind) ? "la marque" : "l'agence") + " de ce projet");
            if (current != null) throw new ConflictException(name(u) + " (" + current.getName() + ") fait déjà partie du projet");
            attach(r, kind, u.getAgency(), me);
            notifications.push(u.getId(), "DEMANDE", "Nouveau projet : " + r.getTitle(),
                    inviteText(r, kind), "/demandes/" + r.getId());
            return new Result("RATTACHE", null, null, u.getAgency().getName(), u.getAgency().getName() + " rejoint le projet");
        }
        jdbc.update("update pro_invitations set revoked_at = now() where request_id = ? and kind = ? and used_at is null and revoked_at is null",
                r.getId(), kind);
        String[] t = token();
        LocalDateTime exp = LocalDateTime.now().plusDays(DAYS);
        jdbc.update("insert into pro_invitations (id, token_hash, email, kind, request_id, production_id, created_by, expires_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), t[1], mail, kind, r.getId(), r.getProduction().getId(), me.getId(), Timestamp.valueOf(exp));
        log(r, me, "INVITATION", ("MARQUE".equals(kind) ? "Marque" : "Agence marketing") + " invitée : " + mail);
        return new Result("LIEN", t[0], Timestamp.valueOf(exp).getTime(), null, "Lien prêt : envoyez-le à " + mail);
    }

    @Transactional(readOnly = true)
    public List<InvitationView> requestInvitations(String email, UUID requestId) {
        User me = access.user(email);
        AdRequest r = requests.findById(requestId).orElseThrow(() -> new ResourceNotFoundException("Demande introuvable"));
        if (!sameProduction(me, r.getProduction()) || !me.can("INVITATIONS")) return List.of();
        return pending("request_id = ?", r.getId());
    }

    // ───────── Room : une personne pas encore inscrite ─────────

    /** Compte existant : il entre dans la room. Sinon : ROLE (le chef de room précise son rôle), puis LIEN. */
    @Transactional
    public Result inviteToRoom(String email, UUID projectId, RoomInvite req) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        if (!rooms.perms(me, p).lead()) throw new ForbiddenException("Seul le chef de room invite de nouveaux membres");
        String mail = norm(req.email());
        Optional<User> existing = users.findByEmail(mail);
        if (existing.isPresent()) {
            rooms.invite(email, projectId, new RoomService.InviteRequest(mail));
            return new Result("RATTACHE", null, null, name(existing.get()), name(existing.get()) + " rejoint la room : elle est prévenue.");
        }
        String kind = req.kind() == null ? "" : req.kind().trim().toUpperCase(Locale.ROOT);
        if (!ROOM_KINDS.contains(kind))
            return new Result("ROLE", null, null, null, mail + " n'a pas encore de compte sur Cercle. Choisissez son rôle : elle recevra un lien pour rejoindre la room.");
        Agency owner = p.getOwner().getAgency();
        UUID prod = owner != null && "BOITE_PROD".equals(owner.getKind()) ? owner.getId()
                : me.getRole().production() && me.getAgency() != null ? me.getAgency().getId() : null;
        jdbc.update("update pro_invitations set revoked_at = now() where project_id = ? and lower(email) = ? and used_at is null and revoked_at is null", p.getId(), mail);
        String[] t = token();
        LocalDateTime exp = LocalDateTime.now().plusDays(DAYS);
        jdbc.update("insert into pro_invitations (id, token_hash, email, kind, project_id, production_id, created_by, expires_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), t[1], mail, kind, p.getId(), prod, me.getId(), Timestamp.valueOf(exp));
        audit.log("INVITATION_ROOM", mail, label(Role.valueOf(kind)) + " · " + p.getTitle());
        return new Result("LIEN", t[0], Timestamp.valueOf(exp).getTime(), null, "Lien prêt : envoyez-le à " + mail);
    }

    // ───────── Assistantes de production ─────────

    @Transactional(readOnly = true)
    public Team team(String email) {
        User me = producer(access.user(email));
        UUID org = me.getAgency().getId();
        List<AssistantView> list = users.findAll().stream()
                .filter(u -> u.getRole() == Role.ASSISTANT_PROD && u.getAgency() != null && u.getAgency().getId().equals(org))
                .sorted(Comparator.comparing(User::getFirstName, String.CASE_INSENSITIVE_ORDER))
                .map(u -> new AssistantView(u.getId(), name(u), u.getEmail(), u.isEnabled(), u.perms())).toList();
        return new Team(list, pending("production_id = ? and kind = 'ASSISTANT_PROD'", org), User.PERMS);
    }

    @Transactional
    public Result inviteAssistant(String email, AssistantInvite req) {
        User me = producer(access.user(email));
        String mail = norm(req.email());
        if (users.findByEmail(mail).isPresent()) throw new ConflictException("Un compte existe déjà avec cette adresse : invitez une autre adresse pour votre assistante");
        String perms = perms(req.perms());
        jdbc.update("update pro_invitations set revoked_at = now() where production_id = ? and kind = 'ASSISTANT_PROD' and lower(email) = ? and used_at is null and revoked_at is null",
                me.getAgency().getId(), mail);
        String[] t = token();
        LocalDateTime exp = LocalDateTime.now().plusDays(DAYS);
        jdbc.update("insert into pro_invitations (id, token_hash, email, kind, production_id, perms, created_by, expires_at) values (?, ?, ?, 'ASSISTANT_PROD', ?, ?, ?, ?)",
                UUID.randomUUID(), t[1], mail, me.getAgency().getId(), perms, me.getId(), Timestamp.valueOf(exp));
        audit.log("INVITATION_ASSISTANTE", mail, me.getAgency().getName() + " · " + (perms.isEmpty() ? "aucune autorisation" : perms));
        return new Result("LIEN", t[0], Timestamp.valueOf(exp).getTime(), null, "Lien prêt : envoyez-le à " + mail);
    }

    @Transactional
    public AssistantView updateAssistant(String email, UUID userId, AssistantUpdate req) {
        User me = producer(access.user(email));
        User u = users.findById(userId).filter(x -> x.getRole() == Role.ASSISTANT_PROD && sameProduction(x, me.getAgency()))
                .orElseThrow(() -> new ResourceNotFoundException("Assistante introuvable"));
        if (req.perms() != null) u.setAssistantPerms(perms(req.perms()));
        if (req.enabled() != null) u.setEnabled(req.enabled());
        users.save(u);
        audit.log("ASSISTANTE_MODIFIEE", u.getEmail(), (u.isEnabled() ? "active" : "désactivée") + " · " + String.join(",", u.perms()));
        if (req.perms() != null && u.isEnabled())
            notifications.push(u.getId(), "EQUIPE", "Vos autorisations ont changé", name(me) + " a mis à jour ce que vous pouvez faire pour " + me.getAgency().getName() + ".", "/demandes");
        return new AssistantView(u.getId(), name(u), u.getEmail(), u.isEnabled(), u.perms());
    }

    @Transactional
    public void revoke(String email, UUID invitationId) {
        User me = access.user(email);
        if (!me.getRole().production() || me.getAgency() == null) throw new ForbiddenException("Réservé à la boîte de production");
        String kind = jdbc.query("select kind from pro_invitations where id = ? and production_id = ?", rs -> rs.next() ? rs.getString(1) : null,
                invitationId, me.getAgency().getId());
        if (kind == null) throw new ResourceNotFoundException("Invitation introuvable");
        if ("ASSISTANT_PROD".equals(kind) ? me.getRole() != Role.BOITE_PROD : !me.can("INVITATIONS"))
            throw new ForbiddenException("Vous ne pouvez pas annuler cette invitation");
        jdbc.update("update pro_invitations set revoked_at = now() where id = ? and used_at is null", invitationId);
    }

    // ───────── Côté invité (public) ─────────

    @Transactional(readOnly = true)
    public Preview preview(String token) {
        Map<String, Object> inv = valid(token);
        String kind = (String) inv.get("kind");
        Agency prod = inv.get("production_id") == null ? null : agencies.findById((UUID) inv.get("production_id")).orElse(null);
        Project room = room(inv);
        AdRequest r = request(inv, room);
        Agency join = join(kind, r, prod);
        User inviterUser = inv.get("created_by") == null ? null : users.findById((UUID) inv.get("created_by")).orElse(null);
        String inviter = inviterUser == null ? null : name(inviterUser);
        String host = prod != null ? prod.getName() : inviterUser != null && inviterUser.getAgency() != null ? inviterUser.getAgency().getName() : inviter == null ? "Cercle" : inviter;
        List<String> perms = inv.get("perms") == null ? List.of() : List.of(((String) inv.get("perms")).split(",")).stream().filter(s -> !s.isBlank()).toList();
        return new Preview(kind, (String) inv.get("email"), host, inviter, room != null ? room.getTitle() : r == null ? null : r.getTitle(),
                join == null ? null : join.getName(), join == null && !"REALISATEUR".equals(kind), perms, ((Timestamp) inv.get("expires_at")).getTime(),
                room == null ? null : room.getId());
    }

    @Transactional
    public AuthResponse accept(String token, Accept req) {
        Map<String, Object> inv = valid(token);
        var consent = new ConsentService.Request(req.acceptTerms(), "MAJEUR", null);
        ConsentService.validate(consent);
        String kind = (String) inv.get("kind"), mail = (String) inv.get("email");
        if (users.existsByEmail(mail)) throw new ConflictException("Un compte existe déjà avec cette adresse : connectez-vous, le producer vous rattachera au projet");
        Agency prod = inv.get("production_id") == null ? null : agencies.findById((UUID) inv.get("production_id")).orElse(null);
        Project room = room(inv);
        AdRequest r = request(inv, room);
        if ("ASSISTANT_PROD".equals(kind) ? prod == null : r == null && room == null) throw invalid();

        Agency org = join(kind, r, prod);
        if (org == null && !"REALISATEUR".equals(kind)) {
            String n = req.organisation() == null ? "" : req.organisation().trim();
            if (n.isEmpty()) throw new IllegalArgumentException("MARQUE".equals(kind) ? "Indiquez le nom de votre marque" : "Indiquez le nom de votre agence");
            org = new Agency();
            org.setName(n);
            org.setCity(req.city() == null || req.city().isBlank() ? null : req.city().trim());
            org.setContactEmail(mail);
            org.setContractStart(LocalDate.now());
            org.setKind(kind);
            org = agencies.save(org);
        }
        User u = User.builder().email(mail).password(encoder.encode(req.password()))
                .firstName(req.firstName().trim()).lastName(req.lastName().trim())
                .role(Role.valueOf(kind)).enabled(true).agency(org).emailVerifiedAt(LocalDateTime.now()).build();
        if ("ASSISTANT_PROD".equals(kind)) u.setAssistantPerms(inv.get("perms") == null ? "" : (String) inv.get("perms"));
        users.saveAndFlush(u);
        consents.record(u.getId(), consent, "INVITATION");
        jdbc.update("update pro_invitations set used_at = now() where id = ?", inv.get("id"));
        audit.log("INVITATION_PRO_ACCEPTEE", mail, label(u.getRole()) + " · " + (org == null ? "indépendant" : org.getName()));

        UUID inviter = (UUID) inv.get("created_by");
        if (room != null) {   // invitée par le chef de room : elle entre dans la room
            if (!room.getOwner().getId().equals(u.getId()) && !members.existsByProjectIdAndUserId(room.getId(), u.getId())) {
                ProjectMember pm = new ProjectMember(room.getId(), u.getId(), LocalDateTime.now());
                RoomService.defaults(pm, u);
                members.save(pm);
            }
            if (inviter != null) notifications.push(inviter, "ROOM", name(u) + " a rejoint la room",
                    name(u) + (org == null ? "" : " (" + org.getName() + ")") + " rejoint la room « " + room.getTitle() + " ».", "/rooms/" + room.getId());
            return auth.buildAuthResponse(u);
        }
        if (r != null && inv.get("request_id") != null) {
            boolean attachNow = "MARQUE".equals(kind) ? r.getBrand() == null : r.getAgency() == null;
            if (attachNow) attach(r, kind, org, u);
            else log(r, u, "EQUIPE", name(u) + " rejoint le projet (" + org.getName() + ")");
        }
        if (inviter != null) notifications.push(inviter, "EQUIPE", name(u) + " a accepté votre invitation",
                r == null ? name(u) + " rejoint " + (prod == null ? "votre équipe" : prod.getName()) + " comme assistante de production."
                        : org.getName() + " rejoint le projet « " + r.getTitle() + " ».",
                r == null ? "/equipe" : "/demandes/" + r.getId());
        return auth.buildAuthResponse(u);
    }

    // ───────── Outils ─────────

    private AdRequest inviting(User me, UUID requestId) {
        AdRequest r = requests.findById(requestId).orElseThrow(() -> new ResourceNotFoundException("Demande introuvable"));
        boolean prod = me.getRole() == Role.ADMIN ? r.getProduction() != null : sameProduction(me, r.getProduction());
        if (!prod) throw new ResourceNotFoundException("Demande introuvable");
        if (!me.can("INVITATIONS")) throw new ForbiddenException("Le producer ne vous a pas autorisée à envoyer les invitations");
        if (r.getV2PublishedAt() != null || r.getStatus() == AdRequest.Status.ANNULEE || r.getStatus() == AdRequest.Status.CLOTUREE)
            throw new IllegalArgumentException("Ce projet n'accepte plus d'invitation");
        return r;
    }

    private void attach(AdRequest r, String kind, Agency org, User by) {
        if ("MARQUE".equals(kind)) r.setBrand(org); else r.setAgency(org);
        requests.save(r);
        log(r, by, "EQUIPE", ("MARQUE".equals(kind) ? "Marque" : "Agence marketing") + " rattachée : " + org.getName());
        if ("AGENCE_MARKETING".equals(kind) && r.getBrand() != null) users.findAll().stream()
                .filter(u -> u.getAgency() != null && u.getAgency().getId().equals(r.getBrand().getId()) && u.isEnabled())
                .forEach(u -> notifications.push(u.getId(), "DEMANDE", "Agence rattachée : " + r.getTitle(),
                        org.getName() + " recevra votre V0 dès que vous l'enverrez.", "/demandes/" + r.getId()));
    }

    private Project room(Map<String, Object> inv) {
        return inv.get("project_id") == null ? null : projects.findById((UUID) inv.get("project_id")).orElse(null);
    }

    /** La publicité de l'invitation, ou celle d'où vient la room (pour y retrouver la marque et l'agence). */
    private AdRequest request(Map<String, Object> inv, Project room) {
        if (inv.get("request_id") != null) return requests.findById((UUID) inv.get("request_id")).orElse(null);
        if (room == null) return null;
        List<UUID> ids = jdbc.queryForList("select id from ad_requests where project_id = ?", UUID.class, room.getId());
        return ids.isEmpty() ? null : requests.findById(ids.get(0)).orElse(null);
    }

    /** L'organisation que l'invité rejoint : la marque ou l'agence déjà rattachée au projet, ou la boîte pour une assistante. */
    private static Agency join(String kind, AdRequest r, Agency prod) {
        if ("ASSISTANT_PROD".equals(kind)) return prod;
        if (r == null || "REALISATEUR".equals(kind)) return null;
        return "MARQUE".equals(kind) ? r.getBrand() : r.getAgency();
    }

    private static String inviteText(AdRequest r, String kind) {
        String p = r.getProduction() == null ? "La production" : r.getProduction().getName();
        return "MARQUE".equals(kind) ? p + " vous invite sur ce projet : écrivez votre V0 (le brief) et envoyez-la à l'agence."
                : p + " vous invite sur ce projet : vous recevrez la V0 de la marque pour préparer la V1.";
    }

    private User producer(User me) {
        if (me.getRole() != Role.BOITE_PROD || me.getAgency() == null) throw new ForbiddenException("Seul le producer gère ses assistantes");
        return me;
    }

    private static boolean sameProduction(User me, Agency prod) {
        return prod != null && me.getRole().production() && me.getAgency() != null && me.getAgency().getId().equals(prod.getId());
    }

    private static String perms(List<String> in) {
        if (in == null) return "";
        List<String> bad = in.stream().filter(p -> !User.PERMS.contains(p)).toList();
        if (!bad.isEmpty()) throw new IllegalArgumentException("Autorisation inconnue : " + String.join(", ", bad));
        return String.join(",", User.PERMS.stream().filter(in::contains).toList());
    }

    private List<InvitationView> pending(String where, UUID id) {
        return jdbc.query("""
                select i.id, i.email, i.kind, i.request_id, r.title, i.expires_at, i.perms from pro_invitations i
                left join ad_requests r on r.id = i.request_id
                where i.used_at is null and i.revoked_at is null and i.expires_at > now() and i.""" + where + " order by i.created_at desc",
                (rs, n) -> new InvitationView(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getObject(4, UUID.class), rs.getString(5),
                        rs.getTimestamp(6).getTime(), rs.getString(7) == null || rs.getString(7).isBlank() ? List.of() : List.of(rs.getString(7).split(","))), id);
    }

    private Map<String, Object> valid(String token) {
        if (token == null || token.length() < 20 || token.length() > 100) throw invalid();
        var rows = jdbc.queryForList("select * from pro_invitations where token_hash = ? and used_at is null and revoked_at is null and expires_at > now()",
                InvitationService.hash(token));
        if (rows.isEmpty()) throw invalid();
        return rows.get(0);
    }

    private ResourceNotFoundException invalid() {
        return new ResourceNotFoundException("Ce lien d'invitation n'est plus valable : il a déjà servi, a expiré ou a été remplacé. Demandez un nouveau lien au producer.");
    }

    private static String[] token() {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String t = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        return new String[]{ t, InvitationService.hash(t) };
    }

    private void log(AdRequest r, User by, String type, String message) {
        AdEvent e = new AdEvent();
        e.setRequest(r); e.setActor(by); e.setType(type); e.setMessage(message.length() > 400 ? message.substring(0, 400) : message);
        events.save(e);
    }

    private static String norm(String email) { return email.trim().toLowerCase(Locale.ROOT); }
    private static String name(User u) { return (u.getFirstName() + " " + u.getLastName()).trim(); }
    private static String label(Role r) {
        return switch (r) {
            case MARQUE -> "Marque";
            case AGENCE_MARKETING -> "Agence marketing";
            case BOITE_PROD -> "Boîte de production";
            case ASSISTANT_PROD -> "Assistante de production";
            case REALISATEUR -> "Réalisateur";
            case ACTEUR -> "Acteur";
            case ADMIN -> "Administrateur";
        };
    }
}
