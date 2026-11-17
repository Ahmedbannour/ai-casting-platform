package com.castingai.service;

import com.castingai.entity.CastingRole;
import com.castingai.entity.User;
import com.castingai.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Partage d'une shortlist au réalisateur : un lien secret, sans compte, limité dans le temps.
 * Le réalisateur voit les candidats SANS leurs coordonnées et donne un avis (oui / peut-être / non) sur chacun.
 */
@Service
@RequiredArgsConstructor
public class ShareService {

    private static final SecureRandom RNG = new SecureRandom();
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    private static final Set<String> VOTES = Set.of("OUI", "PEUT_ETRE", "NON");

    private final JdbcTemplate jdbc;
    private final AccessService access;
    private final RoleService roleService;
    private final NotificationService notifications;

    // ── Résultats ──
    public record ShareRow(UUID id, String token, String label, LocalDateTime createdAt, LocalDateTime expiresAt,
                           boolean active, long votes, long oui, long peutEtre, long non) {}
    public record VoteRow(UUID entryId, String vote, String comment, String voterName, LocalDateTime updatedAt, String shareLabel) {}
    public record PublicCandidate(UUID entryId, String firstName, String lastName, Integer age, String gender, String city,
                                  Integer height, String photoUrl, String bio, List<String> languages, List<String> skills,
                                  List<String> experiences, String vote, String comment) {}
    public record PublicShare(String projectTitle, String projectType, String roleName, String roleDescription, String criteria,
                              LocalDate shootStart, LocalDate shootEnd, String label, LocalDateTime expiresAt, String voterName,
                              List<PublicCandidate> candidates) {}

    // ── Côté agence ──

    @Transactional
    public ShareRow create(String email, UUID roleId, String label, int days) {
        User me = access.user(email);
        roleService.visibleRole(me, roleId);
        int d = Math.max(1, Math.min(days, 90));
        String token = token();
        UUID id = UUID.randomUUID();
        jdbc.update("insert into role_shares (id, role_id, token, label, created_by, expires_at) values (?, ?, ?, ?, ?, now() + (? * interval '1 day'))",
                id, roleId, token, blank(label), me.getId(), d);
        return list(email, roleId).stream().filter(s -> s.id().equals(id)).findFirst().orElseThrow();
    }

    @Transactional(readOnly = true)
    public List<ShareRow> list(String email, UUID roleId) {
        roleService.visibleRole(access.user(email), roleId);
        return jdbc.query("""
            select s.id, s.token, s.label, s.created_at, s.expires_at,
              (s.revoked_at is null and s.expires_at > now()) as active,
              (select count(*) from share_votes v where v.share_id = s.id) as votes,
              (select count(*) from share_votes v where v.share_id = s.id and v.vote = 'OUI') as oui,
              (select count(*) from share_votes v where v.share_id = s.id and v.vote = 'PEUT_ETRE') as pe,
              (select count(*) from share_votes v where v.share_id = s.id and v.vote = 'NON') as non
            from role_shares s where s.role_id = ? order by s.created_at desc
            """, (rs, i) -> new ShareRow(rs.getObject("id", UUID.class), rs.getString("token"), rs.getString("label"),
                rs.getObject("created_at", LocalDateTime.class), rs.getObject("expires_at", LocalDateTime.class),
                rs.getBoolean("active"), rs.getLong("votes"), rs.getLong("oui"), rs.getLong("pe"), rs.getLong("non")), roleId);
    }

    @Transactional
    public void revoke(String email, UUID shareId) {
        UUID roleId = jdbc.query("select role_id from role_shares where id = ?", (rs, i) -> rs.getObject(1, UUID.class), shareId)
                .stream().findFirst().orElseThrow(() -> new ResourceNotFoundException("Lien introuvable"));
        roleService.visibleRole(access.user(email), roleId);
        jdbc.update("update role_shares set revoked_at = now() where id = ? and revoked_at is null", shareId);
    }

    /** Avis reçus sur les candidats d'un rôle (le plus récent par candidat). */
    @Transactional(readOnly = true)
    public List<VoteRow> votes(String email, UUID roleId) {
        roleService.visibleRole(access.user(email), roleId);
        return jdbc.query("""
            select distinct on (v.entry_id) v.entry_id, v.vote, v.comment, v.voter_name, v.updated_at, s.label
            from share_votes v join role_shares s on s.id = v.share_id
            where s.role_id = ? order by v.entry_id, v.updated_at desc
            """, (rs, i) -> new VoteRow(rs.getObject(1, UUID.class), rs.getString(2), rs.getString(3), rs.getString(4),
                rs.getObject(5, LocalDateTime.class), rs.getString(6)), roleId);
    }

    // ── Côté réalisateur (public, par lien) ──

    private record Share(UUID id, UUID roleId, String label, LocalDateTime expiresAt) {}

    private Share open(String token) {
        if (token == null || !token.matches("[A-Za-z0-9]{20,64}")) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Lien de partage introuvable");
        List<Object[]> rows = jdbc.query("select id, role_id, label, expires_at, revoked_at from role_shares where token = ?",
                (rs, i) -> new Object[]{rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3),
                        rs.getObject(4, LocalDateTime.class), rs.getObject(5, LocalDateTime.class)}, token);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Lien de partage introuvable");
        Object[] r = rows.get(0);
        if (r[4] != null) throw new ResponseStatusException(HttpStatus.GONE, "Ce lien a été retiré par l'agence de casting");
        if (((LocalDateTime) r[3]).isBefore(LocalDateTime.now())) throw new ResponseStatusException(HttpStatus.GONE, "Ce lien a expiré : demandez-en un nouveau à l'agence de casting");
        return new Share((UUID) r[0], (UUID) r[1], (String) r[2], (LocalDateTime) r[3]);
    }

    @Transactional(readOnly = true)
    public PublicShare view(String token) {
        Share s = open(token);
        Map<String, Object> role = jdbc.queryForMap("""
            select r.name, r.description, r.gender, r.min_age, r.max_age, r.languages, r.skills, r.city, r.shoot_start, r.shoot_end,
                   p.title, p.type
            from casting_roles r join projects p on p.id = r.project_id where r.id = ?""", s.roleId());

        Map<UUID, String[]> votes = new HashMap<>();
        String[] voter = {null};
        jdbc.query("select entry_id, vote, comment, voter_name from share_votes where share_id = ? order by updated_at",
                rs -> {
                    votes.put(rs.getObject(1, UUID.class), new String[]{rs.getString(2), rs.getString(3)});
                    voter[0] = rs.getString(4);
                }, s.id());

        // Candidats encore en lice (pas les refusés), sans téléphone ni e-mail
        List<PublicCandidate> candidates = jdbc.query("""
            select e.id as entry_id, a.id as actor_id, a.first_name, a.last_name, a.birth_date, a.gender, a.city, a.height, a.bio,
              (select coalesce(p.url, p.thumbnail_url) from actor_photos p where p.actor_id = a.id order by p.is_main desc, p.created_at limit 1) as photo,
              (select string_agg(l.name, '|' order by l.name) from actor_languages l where l.actor_id = a.id) as langs,
              (select string_agg(k.name, '|' order by k.name) from actor_skills k where k.actor_id = a.id) as skills,
              (select string_agg(coalesce(x.production, x.title) || coalesce(' (' || x.year || ')', ''), '|' order by x.year desc nulls last)
                 from (select * from actor_experiences x2 where x2.actor_id = a.id order by x2.year desc nulls last limit 3) x) as exps
            from shortlist_entries e join actors a on a.id = e.actor_id
            where e.role_id = ? and e.status <> 'REFUSE' and a.visibility = 'VISIBLE'
            order by case e.status when 'CHOISI' then 0 when 'RAPPEL' then 1 when 'AUDITION' then 2 else 3 end, e.created_at
            """, (rs, i) -> {
                UUID entryId = rs.getObject("entry_id", UUID.class);
                LocalDate birth = rs.getObject("birth_date", LocalDate.class);
                String[] v = votes.get(entryId);
                String bio = rs.getString("bio");
                return new PublicCandidate(entryId, rs.getString("first_name"), rs.getString("last_name"),
                        birth == null ? null : java.time.Period.between(birth, LocalDate.now()).getYears(),
                        rs.getString("gender"), rs.getString("city"), (Integer) rs.getObject("height"), rs.getString("photo"),
                        bio == null ? null : (bio.length() > 360 ? bio.substring(0, 357) + "…" : bio),
                        split(rs.getString("langs")), split(rs.getString("skills")), split(rs.getString("exps")),
                        v == null ? null : v[0], v == null ? null : v[1]);
            }, s.roleId());

        return new PublicShare((String) role.get("title"), (String) role.get("type"), (String) role.get("name"),
                (String) role.get("description"), criteria(role),
                toDate(role.get("shoot_start")), toDate(role.get("shoot_end")), s.label(), s.expiresAt(), voter[0], candidates);
    }

    @Transactional
    public void vote(String token, UUID entryId, String vote, String comment, String voterName) {
        Share s = open(token);
        if (vote == null || !VOTES.contains(vote)) throw new IllegalArgumentException("Avis attendu : OUI, PEUT_ETRE ou NON");
        String name = voterName == null ? "" : voterName.trim();
        if (name.isEmpty() || name.length() > 80) throw new IllegalArgumentException("Indiquez votre nom (80 caractères au plus)");
        String c = comment == null || comment.isBlank() ? null : comment.trim();
        if (c != null && c.length() > 1000) throw new IllegalArgumentException("Commentaire : 1000 caractères au plus");
        Integer ok = jdbc.queryForObject("select count(*) from shortlist_entries where id = ? and role_id = ?", Integer.class, entryId, s.roleId());
        if (ok == null || ok == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Ce candidat ne fait pas partie de cette sélection");
        jdbc.update("""
            insert into share_votes (share_id, entry_id, voter_name, vote, comment) values (?, ?, ?, ?, ?)
            on conflict (share_id, entry_id) do update set vote = excluded.vote, comment = excluded.comment,
              voter_name = excluded.voter_name, updated_at = now()
            """, s.id(), entryId, name, vote, c);
        // T-096 : le propriétaire du projet est prévenu
        jdbc.query("""
            select p.owner_id, a.first_name || ' ' || a.last_name, r.name
              from shortlist_entries e join actors a on a.id = e.actor_id
              join casting_roles r on r.id = e.role_id join projects p on p.id = r.project_id where e.id = ?
            """, rs -> {
                String label = switch (vote) { case "OUI" -> "oui"; case "NON" -> "non"; default -> "peut-être"; };
                notifications.push((UUID) rs.getObject(1), "AVIS", name + " a répondu « " + label + " » pour " + rs.getString(2),
                        "Rôle : " + rs.getString(3) + (c == null ? "" : " · « " + c + " »"), "/roles/" + s.roleId());
            }, entryId);
    }

    // ── outils ──

    private static String token() {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 32; i++) b.append(ALPHABET.charAt(RNG.nextInt(ALPHABET.length())));
        return b.toString();
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    private static List<String> split(String s) { return s == null || s.isBlank() ? List.of() : List.of(s.split("\\|")); }

    private static LocalDate toDate(Object o) {
        if (o == null) return null;
        if (o instanceof java.sql.Date d) return d.toLocalDate();
        if (o instanceof LocalDate d) return d;
        return LocalDate.parse(o.toString());
    }

    /** « Femme, 25 à 35 ans, anglais, danse, Paris ». */
    private static String criteria(Map<String, Object> r) {
        List<String> parts = new ArrayList<>();
        if (r.get("gender") != null) parts.add((String) r.get("gender"));
        Object min = r.get("min_age"), max = r.get("max_age");
        if (min != null && max != null) parts.add(min + " à " + max + " ans");
        else if (min != null) parts.add("dès " + min + " ans");
        else if (max != null) parts.add("jusqu'à " + max + " ans");
        for (String k : List.of("languages", "skills")) {
            Object v = r.get(k);
            if (v != null && !v.toString().isBlank()) parts.add(v.toString().replace(",", ", ").toLowerCase(Locale.FRENCH));
        }
        if (r.get("city") != null) parts.add((String) r.get("city"));
        return String.join(" · ", parts);
    }
}
