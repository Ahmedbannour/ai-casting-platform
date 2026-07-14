package com.castingai.dto.dashboard;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class DashboardStatsResponse {
    private long totalActors;
    private long totalPhotos;
    private long totalSearches;
    private long totalDocuments;
}