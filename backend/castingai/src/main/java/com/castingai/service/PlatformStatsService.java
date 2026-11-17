package com.castingai.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Statistiques de la plateforme pour l'administrateur. Tout est agrégé par la base (COUNT, GROUP BY) :
 * aucune liste d'acteurs n'est chargée en mémoire.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PlatformStatsService {

    private final JdbcTemplate jdbc;

    // ── Résultats ──
    public record Delta(long current, long previous) {}
    public record Kpis(long agenciesActive, long agenciesTotal, long agents, long actors, long freelancers,
                       long projectsActive, long projectsTotal, long roles, long rolesFilled,
                       long shortlisted, long auditions, long chosen,
                       Delta newActors30, Delta newFreelancers30, Delta newProjects30, Delta searches30, Delta shortlisted30) {}
    public record MonthPoint(String month, long actorsAgence, long actorsInscription, long actorsImport,
                             long projects, long searches, long shortlisted) {}
    public record Bucket(String label, long count) {}
    public record Freelancers(long total, long withPhoto, long withAvailability, long availableNow, long shortlistedOnce) {}
    public record Overview(Kpis kpis, List<MonthPoint> monthly, List<Bucket> projectStatus, List<Bucket> pipeline,
                           List<Bucket> genders, List<Bucket> ages, List<Bucket> cities, List<Bucket> sources,
                           Freelancers freelancers, LocalDateTime computedAt) {}

    public record AgencyStats(UUID id, String name, String city, String contactEmail, LocalDate contractStart, LocalDate contractEnd,
                              Integer maxAgents, String status, long agents, long projects, long activeProjects,
                              long roles, long rolesFilled, long candidates, long searches30, LocalDateTime lastActivity) {}

    public record ProjectStats(UUID id, String title, String type, String status, LocalDate startDate, LocalDate endDate,
                               LocalDateTime createdAt, String owner, String agency, long roles, long rolesFilled,
                               long candidates, long auditions, long chosen, LocalDateTime lastActivity) {}

    // ── Vue d'ensemble ──

    public Overview overview(int months) {
        int m = Math.max(3, Math.min(months, 24));
        return new Overview(kpis(), monthly(m), projectStatus(), pipeline(), genders(), ages(), cities(), sources(),
                freelancers(), LocalDateTime.now());
    }

    private long count(String sql, Object... args) {
        Long v = jdbc.queryForObject(sql, Long.class, args);
        return v == null ? 0 : v;
    }

    /** Valeur des 30 derniers jours et des 30 jours précédents. */
    private Delta delta(String table, String extraWhere) {
        String where = extraWhere == null ? "" : " and " + extraWhere;
        return new Delta(
                count("select count(*) from " + table + " where created_at >= now() - interval '30 days'" + where),
                count("select count(*) from " + table + " where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days'" + where));
    }

    private Kpis kpis() {
        String active = "contract_start <= current_date and (contract_end is null or contract_end >= current_date)";
        return new Kpis(
                count("select count(*) from agencies where " + active),
                count("select count(*) from agencies"),
                count("select count(*) from users where role = 'AGENT'"),
                count("select count(*) from actors"),
                count("select count(*) from actors where user_id is not null"),
                count("select count(*) from projects where status = 'EN_COURS'"),
                count("select count(*) from projects"),
                count("select count(*) from casting_roles"),
                count("select count(*) from casting_roles where filled"),
                count("select count(*) from shortlist_entries"),
                count("select count(*) from shortlist_entries where status = 'AUDITION'"),
                count("select count(*) from shortlist_entries where status = 'CHOISI'"),
                delta("actors", null),
                delta("actors", "user_id is not null"),
                delta("projects", null),
                delta("search_history", null),
                delta("shortlist_entries", null));
    }

    private List<MonthPoint> monthly(int months) {
        String sql = """
            with m as (
              select generate_series(date_trunc('month', now()) - (? - 1) * interval '1 month',
                                     date_trunc('month', now()), interval '1 month') as start
            )
            select to_char(m.start, 'YYYY-MM') as month,
              (select count(*) from actors a where a.created_at >= m.start and a.created_at < m.start + interval '1 month' and a.source = 'AGENCE') as ag,
              (select count(*) from actors a where a.created_at >= m.start and a.created_at < m.start + interval '1 month' and a.source = 'INSCRIPTION') as ins,
              (select count(*) from actors a where a.created_at >= m.start and a.created_at < m.start + interval '1 month' and a.source = 'IMPORT') as imp,
              (select count(*) from projects p where p.created_at >= m.start and p.created_at < m.start + interval '1 month') as proj,
              (select count(*) from search_history s where s.created_at >= m.start and s.created_at < m.start + interval '1 month') as srch,
              (select count(*) from shortlist_entries e where e.created_at >= m.start and e.created_at < m.start + interval '1 month') as sl
            from m order by m.start
            """;
        return jdbc.query(sql, (rs, i) -> new MonthPoint(rs.getString("month"), rs.getLong("ag"), rs.getLong("ins"),
                rs.getLong("imp"), rs.getLong("proj"), rs.getLong("srch"), rs.getLong("sl")), months);
    }

    private List<Bucket> buckets(String sql) {
        return jdbc.query(sql, (rs, i) -> new Bucket(rs.getString(1), rs.getLong(2)));
    }

    private List<Bucket> projectStatus() {
        return buckets("select status, count(*) from projects group by status order by 2 desc");
    }

    /** Entonnoir de casting : où en sont les candidats des shortlists. */
    private List<Bucket> pipeline() {
        Map<String, Long> got = new HashMap<>();
        buckets("select status, count(*) from shortlist_entries group by status").forEach(b -> got.put(b.label(), b.count()));
        List<Bucket> out = new ArrayList<>();
        for (String s : List.of("PRESELECTIONNE", "AUDITION", "RAPPEL", "CHOISI", "REFUSE")) out.add(new Bucket(s, got.getOrDefault(s, 0L)));
        return out;
    }

    private List<Bucket> genders() {
        return buckets("select coalesce(nullif(gender, ''), 'Non précisé'), count(*) from actors group by 1 order by 2 desc");
    }

    private List<Bucket> ages() {
        return buckets("""
            select b, count(*) from (
              select case
                when birth_date is null then 'Non précisé'
                when date_part('year', age(birth_date)) < 18 then 'Moins de 18'
                when date_part('year', age(birth_date)) <= 25 then '18–25'
                when date_part('year', age(birth_date)) <= 35 then '26–35'
                when date_part('year', age(birth_date)) <= 50 then '36–50'
                else '51 et plus' end as b
              from actors) t
            group by b
            order by case b when 'Moins de 18' then 0 when '18–25' then 1 when '26–35' then 2 when '36–50' then 3 when '51 et plus' then 4 else 5 end
            """);
    }

    private List<Bucket> cities() {
        return buckets("select initcap(trim(city)), count(*) from actors where city is not null and trim(city) <> '' group by 1 order by 2 desc, 1 limit 8");
    }

    private List<Bucket> sources() {
        return buckets("select source, count(*) from actors group by source order by 2 desc");
    }

    private Freelancers freelancers() {
        String f = "a.user_id is not null";
        return new Freelancers(
                count("select count(*) from actors a where " + f),
                count("select count(*) from actors a where " + f + " and exists (select 1 from actor_photos p where p.actor_id = a.id)"),
                count("select count(*) from actors a where " + f + " and exists (select 1 from actor_availabilities v where v.actor_id = a.id and v.to_date >= current_date)"),
                count("select count(*) from actors a where " + f + " and exists (select 1 from actor_availabilities v where v.actor_id = a.id and current_date between v.from_date and v.to_date)"),
                count("select count(*) from actors a where " + f + " and exists (select 1 from shortlist_entries e where e.actor_id = a.id)"));
    }

    // ── Agences ──

    public List<AgencyStats> agencies() {
        String sql = """
            select a.id, a.name, a.city, a.contact_email, a.contract_start, a.contract_end, a.max_agents,
              case when a.contract_start > current_date then 'A_VENIR'
                   when a.contract_end is not null and a.contract_end < current_date then 'EXPIRE' else 'ACTIF' end as status,
              (select count(*) from users u where u.agency_id = a.id) as agents,
              (select count(*) from projects p join users u on u.id = p.owner_id where u.agency_id = a.id) as projects,
              (select count(*) from projects p join users u on u.id = p.owner_id where u.agency_id = a.id and p.status = 'EN_COURS') as active_projects,
              (select count(*) from casting_roles r join projects p on p.id = r.project_id join users u on u.id = p.owner_id where u.agency_id = a.id) as roles,
              (select count(*) from casting_roles r join projects p on p.id = r.project_id join users u on u.id = p.owner_id where u.agency_id = a.id and r.filled) as filled,
              (select count(*) from shortlist_entries e join casting_roles r on r.id = e.role_id join projects p on p.id = r.project_id
                 join users u on u.id = p.owner_id where u.agency_id = a.id) as candidates,
              (select count(*) from search_history s join users u on u.id = s.user_id where u.agency_id = a.id and s.created_at >= now() - interval '30 days') as searches30,
              (select max(p.updated_at) from projects p join users u on u.id = p.owner_id where u.agency_id = a.id) as last_activity
            from agencies a
            order by status, a.name
            """;
        return jdbc.query(sql, (rs, i) -> new AgencyStats(
                rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("city"), rs.getString("contact_email"),
                rs.getObject("contract_start", LocalDate.class), rs.getObject("contract_end", LocalDate.class),
                (Integer) rs.getObject("max_agents"), rs.getString("status"), rs.getLong("agents"), rs.getLong("projects"),
                rs.getLong("active_projects"), rs.getLong("roles"), rs.getLong("filled"), rs.getLong("candidates"),
                rs.getLong("searches30"), rs.getObject("last_activity", LocalDateTime.class)));
    }

    // ── Projets ──

    public List<ProjectStats> projects(String status) {
        String filter = status == null || status.isBlank() ? "" : " where p.status = ?";
        String sql = """
            select p.id, p.title, p.type, p.status, p.start_date, p.end_date, p.created_at,
              u.first_name || ' ' || u.last_name as owner, ag.name as agency,
              (select count(*) from casting_roles r where r.project_id = p.id) as roles,
              (select count(*) from casting_roles r where r.project_id = p.id and r.filled) as filled,
              (select count(*) from shortlist_entries e join casting_roles r on r.id = e.role_id where r.project_id = p.id) as candidates,
              (select count(*) from shortlist_entries e join casting_roles r on r.id = e.role_id where r.project_id = p.id and e.status = 'AUDITION') as auditions,
              (select count(*) from shortlist_entries e join casting_roles r on r.id = e.role_id where r.project_id = p.id and e.status = 'CHOISI') as chosen,
              greatest(p.updated_at, (select max(e.updated_at) from shortlist_entries e join casting_roles r on r.id = e.role_id where r.project_id = p.id)) as last_activity
            from projects p
            join users u on u.id = p.owner_id
            left join agencies ag on ag.id = u.agency_id
            """ + filter + " order by p.created_at desc limit 300";
        Object[] args = filter.isEmpty() ? new Object[0] : new Object[]{status};
        return jdbc.query(sql, (rs, i) -> new ProjectStats(
                rs.getObject("id", UUID.class), rs.getString("title"), rs.getString("type"), rs.getString("status"),
                rs.getObject("start_date", LocalDate.class), rs.getObject("end_date", LocalDate.class),
                rs.getObject("created_at", LocalDateTime.class), rs.getString("owner"), rs.getString("agency"),
                rs.getLong("roles"), rs.getLong("filled"), rs.getLong("candidates"), rs.getLong("auditions"),
                rs.getLong("chosen"), rs.getObject("last_activity", LocalDateTime.class)), args);
    }
}
