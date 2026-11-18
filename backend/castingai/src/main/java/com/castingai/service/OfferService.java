package com.castingai.service;

import com.castingai.entity.Role;
import com.castingai.entity.ShortlistEntry;
import com.castingai.entity.User;
import com.castingai.exception.ConflictException;
import com.castingai.exception.ForbiddenException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.ShortlistEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * T-095 · Propositions de rôle et convocations à une audition.
 * L'agent les envoie depuis la shortlist ; l'acteur (compte freelance) accepte ou décline dans son espace.
 * Accepter une convocation fait passer le candidat en « Audition » à la date proposée.
 */
@Service
@RequiredArgsConstructor
public class OfferService {

    private static final Set<String> KINDS = Set.of("PROPOSITION", "AUDITION");

    private final JdbcTemplate jdbc;
    private final AccessService access;
    private final ShortlistService shortlist;
    private final ShortlistEntryRepository entries;
    private final RoleService roleService;
    private final NotificationService notifications;

    public record OfferRow(UUID id, UUID entryId, String kind, String message, LocalDate auditionDate, String status,
                           long createdAt, Long answeredAt, String answerNote) {}

    public record MyOffer(UUID id, String kind, String message, LocalDate auditionDate, String status, long createdAt,
                          String answerNote, String projectTitle, String projectType, String roleName, String roleDescription,
                          LocalDate shootStart, LocalDate shootEnd, String city, String agencyName,
                          java.time.LocalTime auditionTime, String auditionPlace) {}

    private static final String MS = "(extract(epoch from (%s at time zone current_setting('TimeZone'))) * 1000)::bigint";

    // ── Côté agence ──

    @Transactional
    public OfferRow send(String email, UUID entryId, String kind, String message, LocalDate auditionDate) {
        return send(email, entryId, kind, message, auditionDate, null, null);
    }

    @Transactional
    public OfferRow send(String email, UUID entryId, String kind, String message, LocalDate auditionDate,
                         java.time.LocalTime auditionTime, String auditionPlace) {
        User me = access.user(email);
        ShortlistEntry e = shortlist.visibleEntry(me, entryId);
        if (kind == null || !KINDS.contains(kind)) throw new IllegalArgumentException("Type attendu : PROPOSITION ou AUDITION");
        if (e.getActor().getAccount() == null) {
            throw new IllegalArgumentException("Cet acteur n'a pas de compte sur la plateforme : contactez-le directement");
        }
        if ("PAUSE".equals(e.getActor().getVisibility())) {
            throw new IllegalArgumentException("Cet acteur a mis son profil en pause : il ne reçoit pas de proposition");
        }
        if ("AUDITION".equals(kind)) {
            if (auditionDate == null) throw new IllegalArgumentException("Indiquez la date de l'audition");
            if (auditionDate.isBefore(LocalDate.now())) throw new IllegalArgumentException("La date de l'audition est déjà passée");
            LocalDate end = e.getRole().getShootEnd();
            if (end != null && auditionDate.isAfter(end)) throw new IllegalArgumentException("L'audition doit avoir lieu avant la fin du tournage");
        }
        String place = auditionPlace == null || auditionPlace.isBlank() ? null : auditionPlace.trim();
        if (place != null && place.length() > 200) throw new IllegalArgumentException("Lieu : 200 caractères au plus");
        String msg = message == null || message.isBlank() ? null : message.trim();
        if (msg != null && msg.length() > 1000) throw new IllegalArgumentException("Message : 1000 caractères au plus");
        Integer pending = jdbc.queryForObject("select count(*) from role_offers where entry_id = ? and status = 'ENVOYEE'", Integer.class, entryId);
        if (pending != null && pending > 0) throw new ConflictException("Une proposition attend déjà la réponse de cet acteur");
        UUID id = UUID.randomUUID();
        boolean aud = "AUDITION".equals(kind);
        jdbc.update("insert into role_offers (id, entry_id, kind, message, audition_date, audition_time, audition_place, sent_by) values (?, ?, ?, ?, ?, ?, ?, ?)",
                id, entryId, kind, msg, aud ? auditionDate : null, aud ? auditionTime : null, aud ? place : null, me.getId());
        // T-096 : l'acteur est prévenu
        notifications.push(e.getActor().getAccount().getId(), "PROPOSITION",
                ("AUDITION".equals(kind) ? "Convocation à une audition : " : "Proposition de rôle : ") + e.getRole().getName(),
                (me.getAgency() == null ? "La plateforme" : me.getAgency().getName()) + " attend votre réponse.", "/mes-propositions");
        return row(id);
    }

    /** Dernière proposition de chaque candidat du rôle. */
    @Transactional(readOnly = true)
    public List<OfferRow> forRole(String email, UUID roleId) {
        User me = access.user(email);
        roleService.visibleRole(me, roleId);
        return jdbc.query("""
            select distinct on (o.entry_id) o.id, o.entry_id, o.kind, o.message, o.audition_date, o.status,
                   %s, %s, o.answer_note
              from role_offers o join shortlist_entries e on e.id = o.entry_id
             where e.role_id = ?
             order by o.entry_id, o.created_at desc
            """.formatted(MS.formatted("o.created_at"), MS.formatted("o.answered_at")), this::map, roleId);
    }

    @Transactional
    public void cancel(String email, UUID offerId) {
        User me = access.user(email);
        UUID entryId = jdbc.query("select entry_id from role_offers where id = ? and status = 'ENVOYEE'",
                rs -> rs.next() ? (UUID) rs.getObject(1) : null, offerId);
        if (entryId == null) throw new ResourceNotFoundException("Proposition introuvable ou déjà traitée");
        shortlist.visibleEntry(me, entryId);
        jdbc.update("update role_offers set status = 'ANNULEE', answered_at = now() where id = ?", offerId);
    }

    // ── Côté acteur ──

    @Transactional(readOnly = true)
    public List<MyOffer> mine(String email) {
        User me = actor(email);
        return jdbc.query("""
            select o.id, o.kind, o.message, o.audition_date, o.status, %s, o.answer_note,
                   p.title, p.type, r.name, r.description, r.shoot_start, r.shoot_end, r.city,
                   coalesce(ag.name, 'La plateforme'), o.audition_time, o.audition_place
              from role_offers o
              join shortlist_entries e on e.id = o.entry_id
              join actors a on a.id = e.actor_id
              join casting_roles r on r.id = e.role_id
              join projects p on p.id = r.project_id
              left join users s on s.id = o.sent_by
              left join agencies ag on ag.id = s.agency_id
             where a.user_id = ? and o.status <> 'ANNULEE'
             order by (o.status = 'ENVOYEE') desc, o.created_at desc
            """.formatted(MS.formatted("o.created_at")), (rs, i) -> new MyOffer(
                (UUID) rs.getObject(1), rs.getString(2), rs.getString(3), date(rs, 4), rs.getString(5), rs.getLong(6),
                rs.getString(7), rs.getString(8), rs.getString(9), rs.getString(10), rs.getString(11),
                date(rs, 12), date(rs, 13), rs.getString(14), rs.getString(15),
                rs.getObject(16, java.time.LocalTime.class), rs.getString(17)), me.getId());
    }

    @Transactional
    public void answer(String email, UUID offerId, String answer, String note) {
        User me = actor(email);
        if (!"ACCEPTEE".equals(answer) && !"DECLINEE".equals(answer)) throw new IllegalArgumentException("Réponse attendue : ACCEPTEE ou DECLINEE");
        String n = note == null || note.isBlank() ? null : note.trim();
        if (n != null && n.length() > 500) throw new IllegalArgumentException("Mot pour l'agence : 500 caractères au plus");
        var found = jdbc.query("""
            select o.entry_id, o.kind, o.audition_date, o.status, o.audition_time, o.audition_place from role_offers o
              join shortlist_entries e on e.id = o.entry_id join actors a on a.id = e.actor_id
             where o.id = ? and a.user_id = ?
            """, (rs, i) -> new Object[]{ rs.getObject(1), rs.getString(2), date(rs, 3), rs.getString(4),
                    rs.getObject(5, java.time.LocalTime.class), rs.getString(6) }, offerId, me.getId());
        if (found.isEmpty()) throw new ResourceNotFoundException("Proposition introuvable");
        Object[] o = found.get(0);
        if (!"ENVOYEE".equals(o[3])) throw new ConflictException("Cette proposition a déjà reçu une réponse ou a été retirée");
        jdbc.update("update role_offers set status = ?, answer_note = ?, answered_at = now() where id = ?", answer, n, offerId);
        // T-096 : l'agent qui a envoyé la demande est prévenu
        jdbc.query("""
            select o.sent_by, a.first_name || ' ' || a.last_name, r.name, r.id from role_offers o
              join shortlist_entries e on e.id = o.entry_id join actors a on a.id = e.actor_id
              join casting_roles r on r.id = e.role_id where o.id = ?
            """, rs -> {
                notifications.push((UUID) rs.getObject(1), "REPONSE",
                        rs.getString(2) + ("ACCEPTEE".equals(answer) ? " a accepté" : " a décliné") + " votre demande",
                        "Rôle : " + rs.getString(3) + (n == null ? "" : " · « " + n + " »"), "/roles/" + rs.getObject(4));
            }, offerId);
        // Convocation acceptée : le candidat passe en audition à la date prévue
        if ("ACCEPTEE".equals(answer) && "AUDITION".equals(o[1])) {
            entries.findById((UUID) o[0]).ifPresent(e -> {
                if (e.getStatus() == ShortlistEntry.Status.PRESELECTIONNE) e.setStatus(ShortlistEntry.Status.AUDITION);
                e.setAuditionDate((LocalDate) o[2]);
                e.setAuditionTime((java.time.LocalTime) o[4]);
                e.setAuditionPlace((String) o[5]);
                entries.save(e);
            });
        }
    }

    // ── outils ──

    private User actor(String email) {
        User me = access.user(email);
        if (me.getRole() != Role.ACTEUR) throw new ForbiddenException("Réservé aux comptes acteur");
        return me;
    }

    private OfferRow row(UUID id) {
        return jdbc.queryForObject("select o.id, o.entry_id, o.kind, o.message, o.audition_date, o.status, %s, %s, o.answer_note from role_offers o where o.id = ?"
                .formatted(MS.formatted("o.created_at"), MS.formatted("o.answered_at")), this::map, id);
    }

    private OfferRow map(ResultSet rs, int i) throws SQLException {
        long answered = rs.getLong(8);
        Long answeredAt = rs.wasNull() ? null : answered;
        return new OfferRow((UUID) rs.getObject(1), (UUID) rs.getObject(2), rs.getString(3), rs.getString(4), date(rs, 5),
                rs.getString(6), rs.getLong(7), answeredAt, rs.getString(9));
    }

    private static LocalDate date(ResultSet rs, int col) throws SQLException {
        java.sql.Date d = rs.getDate(col);
        return d == null ? null : d.toLocalDate();
    }
}
