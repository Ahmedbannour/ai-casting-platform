package com.castingai.service;

import com.castingai.entity.Role;
import com.castingai.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * T-143 · Accueil de l'agent : rôles à pourvoir et avancement de leur shortlist, demandes en attente de réponse,
 * réponses reçues. Limité aux projets de l'équipe de l'agent (l'administrateur voit tout).
 */
@Service
@RequiredArgsConstructor
public class AgencyHomeService {

    private final JdbcTemplate jdbc;
    private final AccessService access;

    public record RoleToFill(UUID id, String name, UUID projectId, String projectTitle, String importance, LocalDate shootStart,
                             int preselected, int audition, int callback, int chosen) {}
    public record Pending(UUID offerId, String kind, UUID roleId, String roleName, String actorName, long sentAt, LocalDate auditionDate) {}
    public record Answer(UUID roleId, String roleName, String actorName, String kind, String status, long answeredAt, String note) {}
    public record Home(int activeProjects, int openRoles, int filledRoles, int pendingCount, int answers7d,
                       List<RoleToFill> rolesToFill, List<Pending> pending, List<Answer> answers) {}

    private static final String MS = "(extract(epoch from (%s at time zone current_setting('TimeZone'))) * 1000)::bigint";

    @Transactional(readOnly = true)
    public Home home(String email) {
        User me = access.user(email);
        String scope;
        List<Object> a = new ArrayList<>();
        if (me.getRole() == Role.ADMIN) scope = "true";
        else {
            scope = "(p.owner_id = ? or exists (select 1 from project_members m where m.project_id = p.id and m.user_id = ?))";
            a.add(me.getId()); a.add(me.getId());
        }
        Object[] args = a.toArray();

        int active = count("select count(*) from projects p where p.status = 'EN_COURS' and " + scope, args);
        int open = count("select count(*) from casting_roles r join projects p on p.id = r.project_id where p.status = 'EN_COURS' and not r.filled and " + scope, args);
        int filled = count("select count(*) from casting_roles r join projects p on p.id = r.project_id where p.status = 'EN_COURS' and r.filled and " + scope, args);

        List<RoleToFill> roles = jdbc.query("""
            select r.id, r.name, p.id, p.title, r.importance, r.shoot_start,
                   count(*) filter (where e.status = 'PRESELECTIONNE'), count(*) filter (where e.status = 'AUDITION'),
                   count(*) filter (where e.status = 'RAPPEL'), count(*) filter (where e.status = 'CHOISI')
              from casting_roles r join projects p on p.id = r.project_id
              left join shortlist_entries e on e.role_id = r.id
             where p.status = 'EN_COURS' and not r.filled and %s
             group by r.id, p.id
             order by r.shoot_start nulls last, case r.importance when 'PRINCIPAL' then 0 when 'SECONDAIRE' then 1 else 2 end, r.name
             limit 8
            """.formatted(scope), (rs, i) -> new RoleToFill((UUID) rs.getObject(1), rs.getString(2), (UUID) rs.getObject(3), rs.getString(4),
                rs.getString(5), rs.getObject(6, LocalDate.class), rs.getInt(7), rs.getInt(8), rs.getInt(9), rs.getInt(10)), args);

        String offers = """
              from role_offers o join shortlist_entries e on e.id = o.entry_id join actors ac on ac.id = e.actor_id
              join casting_roles r on r.id = e.role_id join projects p on p.id = r.project_id
             where %s and """.formatted(scope);
        int pendingCount = count("select count(*) " + offers + " o.status = 'ENVOYEE'", args);
        List<Pending> pending = jdbc.query("select o.id, o.kind, r.id, r.name, ac.first_name || ' ' || ac.last_name, " + MS.formatted("o.created_at")
                + ", o.audition_date " + offers + " o.status = 'ENVOYEE' order by o.created_at limit 8",
                (rs, i) -> new Pending((UUID) rs.getObject(1), rs.getString(2), (UUID) rs.getObject(3), rs.getString(4), rs.getString(5),
                        rs.getLong(6), rs.getObject(7, LocalDate.class)), args);
        int answers7d = count("select count(*) " + offers + " o.status in ('ACCEPTEE', 'DECLINEE') and o.answered_at > now() - interval '7 days'", args);
        List<Answer> answers = jdbc.query("select r.id, r.name, ac.first_name || ' ' || ac.last_name, o.kind, o.status, " + MS.formatted("o.answered_at")
                + ", o.answer_note " + offers + " o.status in ('ACCEPTEE', 'DECLINEE') order by o.answered_at desc limit 6",
                (rs, i) -> new Answer((UUID) rs.getObject(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
                        rs.getLong(6), rs.getString(7)), args);
        return new Home(active, open, filled, pendingCount, answers7d, roles, pending, answers);
    }

    private int count(String sql, Object[] args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }
}
