package com.castingai.service;

import com.castingai.dto.dashboard.DashboardStatsResponse;
import com.castingai.repository.ActorRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Implementation of DashboardService.
 */
@Service
@RequiredArgsConstructor
public class DashboardServiceImpl implements DashboardService {

    private final ActorRepository actorRepository;

    @Override
    public DashboardStatsResponse getStats() {
        return DashboardStatsResponse.builder()
                .totalActors(actorRepository.count())
                .totalPhotos(0L)
                .totalSearches(0L)
                .totalDocuments(0L)
                .build();
    }
}