package com.castingai.ai;

import com.castingai.ai.dto.SearchRequest;
import com.castingai.ai.dto.SearchResponse;

/**
 * AI-powered natural language search service.
 */
public interface AiSearchService {

    SearchResponse search(SearchRequest request, String userEmail);

    Object getHistory(String userEmail, int limit);

    /** Explication par l'IA (5 acteurs max), appelée après l'affichage des résultats. */
    void feedback(String userEmail, String query, java.util.UUID actorId, String decision);

    java.util.Map<String, String> explain(String query, java.util.List<java.util.UUID> actorIds);
}
