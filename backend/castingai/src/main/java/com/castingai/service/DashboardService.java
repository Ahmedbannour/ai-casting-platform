package com.castingai.service;

import com.castingai.dto.dashboard.DashboardStatsResponse;

/**
 * Dashboard statistics service interface.
 */
public interface DashboardService {
    DashboardStatsResponse getStats();
}