package com.castingai.sheet;

import com.castingai.dto.LoginRequest;
import com.castingai.dto.auth.AuthResponse;
import com.castingai.entity.AdRequest;
import com.castingai.entity.ProjectMember;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.ConflictException;
import com.castingai.exception.ForbiddenException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.live.ActivityClock;
import com.castingai.repository.AdRequestRepository;
import com.castingai.repository.ProjectMemberRepository;
import com.castingai.repository.UserRepository;
import com.castingai.service.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.*;

/**
 * P-087 · L'équipe technique du film : des postes fixes, comme sur une feuille de service.
 * Le producer (ou la réalisation) renseigne une personne, ou envoie un lien d'invitation pour un poste.
 * En ouvrant le lien, la personne saisit son mot de passe (celui de son compte, ou celui du compte qu'elle crée) :
 * elle est affectée au poste et entre directement dans la room du projet.
 */
@Service
@RequiredArgsConstructor
public class CrewService {

    public static final int DAYS = 14;
    private static final SecureRandom RANDOM = new SecureRandom();

    public record Post(String key, String dept, String label) {}

    /** Les postes d'un tournage publicitaire, regroupés par département. */
    public static final List<Post> POSTS = List.of(
        new Post("directeur_production", "Production", "Directeur·rice de production"),
        new Post("regisseur", "Production", "Régisseur·se général·e"),
        new Post("chef_operateur", "Image", "Chef opérateur·rice"),
        new Post("chef_electricien", "Image", "Chef électricien·ne"),
        new Post("chef_machiniste", "Image", "Chef machiniste"),
        new Post("ingenieur_son", "Son", "Ingénieur·e du son"),
        new Post("chef_decorateur", "Décors et costumes", "Chef décorateur·rice"),
        new Post("costumes", "Décors et costumes", "Chef costumier·ère, styliste"),
        new Post("maquillage", "Décors et costumes", "Maquillage et coiffure"),
        new Post("scripte", "Plateau", "Scripte"),
        new Post("photographe", "Plateau", "Photographe de plateau"),
        new Post("monteur", "Post-production", "Monteur·se"),
        new Post("etalonneur", "Post-production", "Étalonneur·se"),
        new Post("mixeur", "Post-production", "Mixeur·se son")
    );
    static final Map<String, Post> BY_KEY = new LinkedHashMap<>();
    static { for (Post p : POSTS) BY_KEY.put(p.key(), p); }

    /** status : A_POURVOIR, RENSEIGNE (saisi par le producer), INVITE (lien envoyé), CONFIRME (la personne a rejoint). */
    public record CrewView(String key, String dept, String label, String name, String phone, String email, String address, String city,
                           String location, String status, boolean me, boolean contacts, LocalDateTime invitedAt) {}
    public record Contact(String name, String phone, String email, String address, String city, String location) {}
    public record Invite(String path, long expiresAt) {}
    public record Preview(UUID requestId, String requestTitle, String brandName, String production, String post, String dept, String inviter,
                          String email, String name, long expiresAt) {}
    public record Join(String mode, String email, String password, String firstName, String lastName,
                       String phone, String address, String city, Boolean acceptTerms) {}

    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final AdRequestRepository requests;
    private final ProjectMemberRepository members;
    private final PasswordEncoder encoder;
    private final ConsentService consents;
    private final AuthServiceImpl auth;
    private final AuditService audit;
    private final NotificationService notifications;
    private final ActivityClock clock;

    // ── Lecture ──

    /** Les postes du film. Les coordonnées ne sont visibles que de l'équipe de production et de l'équipe technique confirmée. */
    public List<CrewView> list(User me, AdRequest r, boolean contacts) {
        Map<String, Map<String, Object>> rows = new HashMap<>();
        for (Map<String, Object> row : jdbc.queryForList("select * from project_crew where request_id = ?", r.getId())) rows.put((String) row.get("post_key"), row);
        boolean confirmedCrew = rows.values().stream().anyMatch(x -> me.getId().equals(x.get("user_id")) && "CONFIRME".equals(x.get("status")));
        boolean see = contacts || confirmedCrew;
        List<CrewView> out = new ArrayList<>();
        for (Post p : POSTS) {
            Map<String, Object> x = rows.get(p.key());
            if (x == null) { out.add(new CrewView(p.key(), p.dept(), p.label(), null, null, null, null, null, null, "A_POURVOIR", false, see, null)); continue; }
            boolean mine = me.getId().equals(x.get("user_id"));
            boolean show = see || mine;
            Timestamp inv = (Timestamp) x.get("invited_at");
            out.add(new CrewView(p.key(), p.dept(), p.label(), (String) x.get("full_name"),
                    show ? (String) x.get("phone") : null, show ? (String) x.get("email") : null,
                    show ? (String) x.get("address") : null, (String) x.get("city"), show ? (String) x.get("location") : null,
                    (String) x.get("status"), mine, show, inv == null ? null : inv.toLocalDateTime()));
        }
        return out;
    }

    /** L'utilisateur est-il dans l'équipe technique confirmée du projet ? (il voit alors la fiche) */
    public boolean isCrew(User me, UUID requestId) {
        Integer n = jdbc.queryForObject("select count(*) from project_crew where request_id = ? and user_id = ? and status = 'CONFIRME'", Integer.class, requestId, me.getId());
        return n != null && n > 0;
    }

    // ── Écriture par le producer ou la réalisation (ou la personne elle-même pour ses coordonnées) ──

    @Transactional
    public void save(User me, AdRequest r, String key, Contact c, boolean manage) {
        Post p = post(key);
        Map<String, Object> row = row(r.getId(), p.key());
        boolean self = row != null && me.getId().equals(row.get("user_id"));
        if (!manage && !self) throw new ForbiddenException("L'équipe technique est gérée par le producer et la réalisation");
        String name = clean(c.name(), 160), phone = clean(c.phone(), 40), email = clean(c.email(), 160), address = clean(c.address(), 300),
               city = clean(c.city(), 120), location = clean(c.location(), 500);
        if (phone != null && !phone.matches("[+0-9 ().-]{6,40}")) throw new IllegalArgumentException("Numéro de téléphone invalide");
        if (email != null && !email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) throw new IllegalArgumentException("Adresse e-mail invalide");
        if (location != null && !location.matches("(?i)^(https://|geo:|-?\\d).*")) throw new IllegalArgumentException("Localisation : un lien de carte (https://…) ou des coordonnées GPS");
        if (row == null) {
            if (name == null) throw new IllegalArgumentException("Indiquez le nom de la personne");
            jdbc.update("""
                insert into project_crew (request_id, post_key, full_name, phone, email, address, city, location, status, updated_by)
                values (?, ?, ?, ?, ?, ?, ?, ?, 'RENSEIGNE', ?)""", r.getId(), p.key(), name, phone, email, address, city, location, me.getId());
        } else {
            if (self && !manage) name = (String) row.get("full_name");   // la personne met à jour ses coordonnées, pas son poste
            jdbc.update("""
                update project_crew set full_name = ?, phone = ?, email = ?, address = ?, city = ?, location = ?,
                       status = case when status = 'A_POURVOIR' then 'RENSEIGNE' else status end, updated_by = ?, updated_at = now()
                 where request_id = ? and post_key = ?""", name, phone, email, address, city, location, me.getId(), r.getId(), p.key());
        }
        touch(r);
    }

    @Transactional
    public void clear(User me, AdRequest r, String key) {
        Post p = post(key);
        jdbc.update("delete from project_crew where request_id = ? and post_key = ?", r.getId(), p.key());
        touch(r);
    }

    /** Un lien d'invitation pour ce poste ({@value #DAYS} jours, usage unique). Un nouveau lien remplace l'ancien. */
    @Transactional
    public Invite invite(User me, AdRequest r, String key, Contact c) {
        Post p = post(key);
        if (r.getStatus() == AdRequest.Status.ANNULEE || r.getStatus() == AdRequest.Status.CLOTUREE) throw new IllegalArgumentException("Ce projet n'accepte plus d'invitation");
        Map<String, Object> row = row(r.getId(), p.key());
        if (row != null && "CONFIRME".equals(row.get("status"))) throw new ConflictException("Ce poste est déjà pourvu : retirez la personne avant d'inviter quelqu'un d'autre");
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        Timestamp until = Timestamp.valueOf(LocalDateTime.now().plusDays(DAYS));
        String name = c == null ? null : clean(c.name(), 160), email = c == null ? null : clean(c.email(), 160), phone = c == null ? null : clean(c.phone(), 40);
        if (email != null && !email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) throw new IllegalArgumentException("Adresse e-mail invalide");
        if (row == null)
            jdbc.update("""
                insert into project_crew (request_id, post_key, full_name, email, phone, status, invite_hash, invite_expires_at, invited_by, invited_at, updated_by)
                values (?, ?, ?, ?, ?, 'INVITE', ?, ?, ?, now(), ?)""", r.getId(), p.key(), name, email, phone, InvitationService.hash(token), until, me.getId(), me.getId());
        else
            jdbc.update("""
                update project_crew set full_name = coalesce(?, full_name), email = coalesce(?, email), phone = coalesce(?, phone), status = 'INVITE',
                       invite_hash = ?, invite_expires_at = ?, invited_by = ?, invited_at = now(), updated_by = ?, updated_at = now()
                 where request_id = ? and post_key = ?""", name, email, phone, InvitationService.hash(token), until, me.getId(), me.getId(), r.getId(), p.key());
        audit.log("EQUIPE_TECHNIQUE_INVITATION", me.getEmail(), p.label() + " · " + r.getTitle());
        touch(r);
        return new Invite("/equipe/rejoindre/" + token, until.getTime());
    }

    // ── Le lien d'invitation (public) ──

    @Transactional(readOnly = true)
    public Preview preview(String token) {
        Map<String, Object> inv = valid(token);
        AdRequest r = requests.findById((UUID) inv.get("request_id")).orElseThrow(this::invalid);
        Post p = post((String) inv.get("post_key"));
        User by = inv.get("invited_by") == null ? null : users.findById((UUID) inv.get("invited_by")).orElse(null);
        return new Preview(r.getId(), r.getTitle(), r.getBrand() == null ? null : r.getBrand().getName(),
                r.getProduction() == null ? null : (r.getProduction().getBrandName() != null ? r.getProduction().getBrandName() : r.getProduction().getName()),
                p.label(), p.dept(), by == null ? null : name(by), (String) inv.get("email"), (String) inv.get("full_name"),
                ((Timestamp) inv.get("invite_expires_at")).getTime());
    }

    /**
     * La personne rejoint le poste : avec le mot de passe de son compte s'il existe (« connexion »),
     * sinon en créant son compte avec le mot de passe qu'elle choisit (« creation »). Elle entre dans la room du projet.
     */
    @Transactional(noRollbackFor = org.springframework.security.core.AuthenticationException.class)
    public AuthResponse join(String token, Join j, String clientIp) {
        Map<String, Object> inv = valid(token);
        AdRequest r = requests.findById((UUID) inv.get("request_id")).orElseThrow(this::invalid);
        Post p = post((String) inv.get("post_key"));
        String mail = j.email() == null ? "" : j.email().trim().toLowerCase(Locale.ROOT);
        if (!mail.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) throw new IllegalArgumentException("Adresse e-mail invalide");
        if (j.password() == null || j.password().isBlank()) throw new IllegalArgumentException("Saisissez votre mot de passe");
        User u;
        AuthResponse res;
        if ("connexion".equals(j.mode())) {
            if (!users.existsByEmail(mail)) throw new ResourceNotFoundException("Aucun compte avec cette adresse : choisissez « Créer mon compte »");
            LoginRequest lr = new LoginRequest();
            lr.setEmail(mail); lr.setPassword(j.password());
            res = auth.login(lr, clientIp);   // mauvais mot de passe : 401 et limitation des essais
            u = users.findByEmail(mail).orElseThrow(this::invalid);
            if (u.getRole() == Role.ACTEUR) throw new ForbiddenException("Un compte acteur ne peut pas rejoindre une équipe technique : créez un compte avec une autre adresse");
        } else {
            if (users.existsByEmail(mail)) throw new ConflictException("Un compte existe déjà avec cette adresse : choisissez « J'ai déjà un compte » et saisissez son mot de passe");
            if (j.password().length() < 8) throw new IllegalArgumentException("Mot de passe : 8 caractères au moins");
            String first = clean(j.firstName(), 80), last = clean(j.lastName(), 80);
            if (first == null || last == null) throw new IllegalArgumentException("Indiquez votre prénom et votre nom");
            var consent = new ConsentService.Request(j.acceptTerms(), "MAJEUR", null);
            ConsentService.validate(consent);
            u = User.builder().email(mail).password(encoder.encode(j.password())).firstName(first).lastName(last)
                    .role(Role.TECHNICIEN).enabled(true).emailVerifiedAt(LocalDateTime.now()).build();
            users.saveAndFlush(u);
            consents.record(u.getId(), consent, "INVITATION");
            res = auth.buildAuthResponse(u);
        }
        jdbc.update("""
            update project_crew set user_id = ?, status = 'CONFIRME', full_name = ?, email = ?,
                   phone = coalesce(?, phone), address = coalesce(?, address), city = coalesce(?, city),
                   invite_hash = null, invite_expires_at = null, updated_by = ?, updated_at = now()
             where request_id = ? and post_key = ?""",
                u.getId(), name(u), mail, clean(j.phone(), 40), clean(j.address(), 300), clean(j.city(), 120), u.getId(), r.getId(), p.key());
        if (r.getProject() != null) addToRoom(r.getProject().getId(), u);
        audit.log("EQUIPE_TECHNIQUE_REJOINT", mail, p.label() + " · " + r.getTitle());
        UUID by = (UUID) inv.get("invited_by");
        if (by != null) notifications.push(by, "EQUIPE", name(u) + " a rejoint l'équipe technique",
                name(u) + " est " + p.label().toLowerCase(Locale.ROOT) + " sur « " + r.getTitle() + " ».", "/demandes/" + r.getId() + "#etape-production");
        touch(r);
        return res;
    }

    /** À l'ouverture de la room : l'équipe technique confirmée y entre. */
    @Transactional
    public void joinRoom(UUID requestId, UUID projectId) {
        for (UUID uid : jdbc.queryForList("select user_id from project_crew where request_id = ? and status = 'CONFIRME' and user_id is not null", UUID.class, requestId))
            users.findById(uid).ifPresent(u -> addToRoom(projectId, u));
    }

    private void addToRoom(UUID projectId, User u) {
        if (members.existsByProjectIdAndUserId(projectId, u.getId())) return;
        ProjectMember pm = new ProjectMember(projectId, u.getId(), LocalDateTime.now());
        RoomService.defaults(pm, u);
        members.save(pm);
    }

    // ── Outils ──

    private Map<String, Object> valid(String token) {
        if (token == null || token.length() < 20 || token.length() > 100) throw invalid();
        var rows = jdbc.queryForList("select * from project_crew where invite_hash = ? and invite_expires_at > now()", InvitationService.hash(token));
        if (rows.isEmpty()) throw invalid();
        return rows.get(0);
    }
    private ResourceNotFoundException invalid() {
        return new ResourceNotFoundException("Ce lien d'invitation n'est plus valable : il a déjà servi, a expiré ou a été remplacé. Demandez un nouveau lien au producer.");
    }
    private Map<String, Object> row(UUID requestId, String key) {
        var rows = jdbc.queryForList("select * from project_crew where request_id = ? and post_key = ?", requestId, key);
        return rows.isEmpty() ? null : rows.get(0);
    }
    private static Post post(String key) {
        Post p = BY_KEY.get(key);
        if (p == null) throw new ResourceNotFoundException("Poste inconnu");
        return p;
    }
    private void touch(AdRequest r) {
        jdbc.update("update ad_requests set updated_at = now() where id = ?", r.getId());
        clock.tick(null);
    }
    private static String clean(String s, int max) {
        if (s == null) return null;
        String t = s.trim().replaceAll("\\s+", " ");
        if (t.isEmpty()) return null;
        return t.length() > max ? t.substring(0, max) : t;
    }
    private static String name(User u) { return (u.getFirstName() + " " + u.getLastName()).trim(); }
}
