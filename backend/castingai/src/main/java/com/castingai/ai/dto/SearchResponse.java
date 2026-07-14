package com.castingai.ai.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Full AI search response with results and metadata.
 */
@Data
@Builder
public class SearchResponse {
    private String query;
    private String interpretation;
    private int totalResults;
    private List<ActorSearchResult> results;
}