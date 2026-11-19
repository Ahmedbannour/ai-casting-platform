package com.castingai.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * T-144 · Accueil de l'administrateur : ce qui demande une action (contrats, messages, comptes, sécurité),
 * le pouls de la plateforme sur 14 jours, les agences et les dernières actions du journal.
 */
@Service
@RequiredArgsConstructor
public class AdminHomeService {

    private final JdbcTemplate jdbc;
    private final PlatformStatsService stats;

    public record Expired(UUID id, String name, LocalDate contractEnd, long activeAgents) {}
    public record Inactive(UUID id, String name, LocalDateTime lastActivity) {}
    public record Day(LocalDate day, long signups, long searches, long offers, long answers) {}
    public record AuditRow(String actor, String action, String target, String details, long at) {}
    public record Alerts(List<PlatformStatsService.Renewal> renewals, List<Expired> expired, long unreadMessages,
                         long unverifiedAccounts, long blockedLogins24h, List<Inactive> inactiveAgencies) {}
    public record Home(Alerts alerts, List<Day> days, List<AuditRow> recent, List<PlatformStatsService.AgencyStats> agencies,
                       long actors, long freelancers, long agents, LocalDateTime lastPurge) {}

    @Transactional(readOnly = true)
    public Home home() {
        List<Expired> expired = jdbc.query("""
            select a.id, a.name, a.contract_end, count(u.id) filter (where u.enabled)
              from agencies a left join users u on u.agency_id = a.id
             where a.contract_end is not null and a.contract_end < current_date
             group by a.id having count(u.id) filter (where u.enabled) > 0
             order by a.contract_end desc
            """, (rs, i) -> new Expired((UUID) rs.getObject(1), rs.getString(2), rs.getObject(3, LocalDate.class), rs.getLong(4)));
        List<PlatformStatsService.AgencyStats> agencies = stats.agencies();
        LocalDateTime month = LocalDateTime.now().minusDays(30);
        List<Inactive> inactive = agencies.stream()
                .filter(a -> "ACTIF".equals(a.status()) && (a.lastActivity() == null || a.lastActivity().isBefore(month)))
                .map(a -> new Inactive(a.id(), a.name(), a.lastActivity())).toList();
        Alerts alerts = new Alerts(stats.renewals(), expired,
                n("select count(*) from contact_messages where read_at is null"),
                n("select count(*) from users where email_verified_at is null and enabled"),
                n("select count(*) from audit_log where action = 'CONNEXION_BLOQUEE' and created_at > now() - interval '1 day'"),
                inactive);

        List<Day> days = jdbc.query("""
            select d::date,
              (select count(*) from users u where u.role = 'ACTEUR' and u.created_at::date = d::date),
              (select count(*) from search_history s where s.created_at::date = d::date),
              (select count(*) from role_offers o where o.created_at::date = d::date),
              (select count(*) from role_offers o where o.answered_at::date = d::date and o.status in ('ACCEPTEE', 'DECLINEE'))
            from generate_series(current_date - 13, current_date, interval '1 day') d order by 1
            """, (rs, i) -> new Day(rs.getObject(1, LocalDate.class), rs.getLong(2), rs.getLong(3), rs.getLong(4), rs.getLong(5)));

        List<AuditRow> recent = jdbc.query("""
            select actor_label, action, target, details, (extract(epoch from (created_at at time zone current_setting('TimeZone'))) * 1000)::bigint
              from audit_log order by created_at desc limit 8
            """, (rs, i) -> new AuditRow(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getLong(5)));

        LocalDateTime lastPurge = jdbc.query("select max(created_at) from audit_log where action = 'PURGE_CONSERVATION'",
                rs -> rs.next() ? rs.getObject(1, LocalDateTime.class) : null);
        return new Home(alerts, days, recent, agencies, n("select count(*) from actors"),
                n("select count(*) from users where role = 'ACTEUR'"), n("select count(*) from users where role = 'BOITE_PROD'"), lastPurge);
    }

    private long n(String sql) { Long v = jdbc.queryForObject(sql, Long.class); return v == null ? 0 : v; }
}
