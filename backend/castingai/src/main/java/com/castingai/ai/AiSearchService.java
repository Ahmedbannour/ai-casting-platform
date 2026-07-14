package com.castingai.ai;

import com.castingai.ai.dto.SearchRequest;
import com.castingai.ai.dto.SearchResponse;

/**
 * AI-powered natural language search service.
 */
public interface AiSearchService {

    SearchResponse search(SearchRequest request, String userEmail);

    Object getHistory(String userEmail, int limit);
}