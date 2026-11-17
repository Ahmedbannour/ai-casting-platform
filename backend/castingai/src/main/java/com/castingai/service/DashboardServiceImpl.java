package com.castingai.service;

import com.castingai.dto.dashboard.DashboardStatsResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Compteurs du tableau de bord, limités à ce que l'utilisateur peut voir (T-092) :
 * l'administrateur compte tout ; un agent compte le vivier et les fiches de son agence,
 * et les recherches faites par les agents de son agence.
 */
@Service
@RequiredArgsConstructor
public class DashboardServiceImpl implements DashboardService {

    private final JdbcTemplate jdbc;
    private final ActorScope actorScope;

    private static final String VISIBLE = "(? or a.agency_id is null or a.agency_id = ?)";

    @Override
    @Transactional(readOnly = true)
    public DashboardStatsResponse getStats() {
        ActorScope.Scope s = actorScope.current();
        Object[] p = { s.all(), s.agency() };
        long actors = count("select count(*) from actors a where a.visibility = 'VISIBLE' and " + VISIBLE, p);
        long photos = count("select count(*) from actor_photos x join actors a on a.id = x.actor_id where " + VISIBLE, p);
        long documents = count("select count(*) from actor_documents x join actors a on a.id = x.actor_id where " + VISIBLE, p);
        long searches = s.all()
                ? count("select count(*) from search_history")
                : count("select count(*) from search_history h join users u on u.id = h.user_id where u.agency_id = ?", s.agency());
        return DashboardStatsResponse.builder()
                .totalActors(actors)
                .totalPhotos(photos)
                .totalSearches(searches)
                .totalDocuments(documents)
                .build();
    }

    private long count(String sql, Object... args) {
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }
}
