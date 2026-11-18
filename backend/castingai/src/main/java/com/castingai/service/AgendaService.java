package com.castingai.service;

import com.castingai.entity.Role;
import com.castingai.entity.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * T-116 · Agenda des auditions.
 * L'agent voit les auditions des projets de son équipe (l'administrateur : toutes) ; l'acteur voit les siennes.
 * Les convocations encore sans réponse apparaissent aussi, marquées « en attente ».
 * Chaque soir à 18 h, l'acteur et l'agent sont prévenus dans la cloche des auditions du lendemain.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AgendaService {

    private final JdbcTemplate jdbc;
    private final AccessService access;
    private final NotificationService notifications;

    public record Item(UUID entryId, LocalDate date, LocalTime time, String place, boolean pending,
                       UUID actorId, String actorName, UUID roleId, String roleName, UUID projectId, String projectTitle,
                       String agencyName, String status) {}

    @Transactional(readOnly = true)
    public List<Item> agenda(String email, LocalDate from, LocalDate to) {
        User me = access.user(email);
        LocalDate f = from == null ? LocalDate.now() : from;
        LocalDate t = to == null || to.isBefore(f) ? f.plusDays(60) : to;
        if (t.isAfter(f.plusDays(366))) t = f.plusDays(366);
        String scope;
        List<Object> args = new ArrayList<>();
        if (me.getRole() == Role.ACTEUR) {
            scope = "a.user_id = ?";
            args.add(me.getId());
        } else if (me.getRole() == Role.ADMIN) {
            scope = "true";
        } else {
            scope = "(p.owner_id = ? or exists (select 1 from project_members m where m.project_id = p.id and m.user_id = ?))";
            args.add(me.getId()); args.add(me.getId());
        }
        String sql = """
            select * from (
              select e.id, e.audition_date d, e.audition_time h, e.audition_place l, false pending,
                     a.id aid, a.first_name || ' ' || a.last_name an, r.id rid, r.name rn, p.id pid, p.title pt,
                     coalesce(ag.name, 'La plateforme') agn, e.status st
                from shortlist_entries e
                join actors a on a.id = e.actor_id join casting_roles r on r.id = e.role_id join projects p on p.id = r.project_id
                left join users ow on ow.id = p.owner_id left join agencies ag on ag.id = ow.agency_id
               where e.audition_date between ? and ? and e.status in ('AUDITION', 'RAPPEL') and %1$s
              union all
              select e.id, o.audition_date, o.audition_time, o.audition_place, true,
                     a.id, a.first_name || ' ' || a.last_name, r.id, r.name, p.id, p.title,
                     coalesce(ag.name, 'La plateforme'), 'EN_ATTENTE'
                from role_offers o join shortlist_entries e on e.id = o.entry_id
                join actors a on a.id = e.actor_id join casting_roles r on r.id = e.role_id join projects p on p.id = r.project_id
                left join users s on s.id = o.sent_by left join agencies ag on ag.id = s.agency_id
               where o.kind = 'AUDITION' and o.status = 'ENVOYEE' and o.audition_date between ? and ? and %1$s
            ) x order by d, h nulls last, an
            limit 500
            """.formatted(scope);
        List<Object> all = new ArrayList<>();
        all.add(f); all.add(t); all.addAll(args); all.add(f); all.add(t); all.addAll(args);
        return jdbc.query(sql, (rs, i) -> new Item((UUID) rs.getObject(1), rs.getObject(2, LocalDate.class),
                rs.getObject(3, LocalTime.class), rs.getString(4), rs.getBoolean(5), (UUID) rs.getObject(6), rs.getString(7),
                (UUID) rs.getObject(8), rs.getString(9), (UUID) rs.getObject(10), rs.getString(11), rs.getString(12),
                rs.getString(13)), all.toArray());
    }

    /** Rappel dans la cloche, la veille de l'audition, à l'acteur et à l'agent. Une seule fois par audition. */
    @Scheduled(cron = "${casting.agenda.rappel-cron:0 0 18 * * *}")
    public void scheduled() {
        try { log.info("Rappels d'audition envoyés : {}", remind(LocalDate.now().plusDays(1))); }
        catch (Exception ex) { log.warn("Rappels d'audition : échec", ex); }
    }

    @Transactional
    public int remind(LocalDate day) {
        DateTimeFormatter fr = DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.FRENCH);
        var rows = jdbc.queryForList("""
            select e.id, a.user_id actor_user, e.added_by agent, p.owner_id owner, r.id role_id, r.name role_name,
                   a.first_name || ' ' || a.last_name actor_name, e.audition_time h, e.audition_place l
              from shortlist_entries e
              join actors a on a.id = e.actor_id join casting_roles r on r.id = e.role_id join projects p on p.id = r.project_id
             where e.audition_date = ? and e.status in ('AUDITION', 'RAPPEL') and (e.reminded_on is null or e.reminded_on < current_date)
            """, day);
        for (var r : rows) {
            String quand = fr.format(day) + (r.get("h") == null ? "" : " à " + r.get("h").toString().substring(0, 5).replace(':', 'h'));
            String ou = r.get("l") == null ? "" : " · " + r.get("l");
            if (r.get("actor_user") != null) {
                notifications.push((UUID) r.get("actor_user"), "AUDITION", "Rappel : audition demain pour « " + r.get("role_name") + " »",
                        quand + ou, "/agenda");
            }
            UUID agent = r.get("agent") != null ? (UUID) r.get("agent") : (UUID) r.get("owner");
            if (agent != null) {
                notifications.push(agent, "AUDITION", "Demain : audition de " + r.get("actor_name"),
                        "Rôle « " + r.get("role_name") + " » · " + quand + ou, "/agenda");
            }
            jdbc.update("update shortlist_entries set reminded_on = current_date where id = ?", r.get("id"));
        }
        return rows.size();
    }
}
