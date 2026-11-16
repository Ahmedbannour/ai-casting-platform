package com.castingai.service;

import com.castingai.dto.dashboard.DashboardStatsResponse;
import com.castingai.repository.ActorDocumentRepository;
import com.castingai.repository.ActorPhotoRepository;
import com.castingai.repository.ActorRepository;
import com.castingai.repository.SearchHistoryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Implementation of DashboardService — real counts from the database.
 */
@Service
@RequiredArgsConstructor
public class DashboardServiceImpl implements DashboardService {

    private final ActorRepository actorRepository;
    private final ActorPhotoRepository photoRepository;
    private final SearchHistoryRepository searchHistoryRepository;
    private final ActorDocumentRepository documentRepository;

    @Override
    @Transactional(readOnly = true)
    public DashboardStatsResponse getStats() {
        return DashboardStatsResponse.builder()
                .totalActors(actorRepository.count())
                .totalPhotos(photoRepository.count())
                .totalSearches(searchHistoryRepository.count())
                .totalDocuments(documentRepository.count())
                .build();
    }
}
