package com.castingai.controller;

import com.castingai.ai.AiSearchService;
import com.castingai.ai.dto.SearchRequest;
import com.castingai.ai.dto.SearchResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

/**
 * REST controller for AI-powered search.
 */
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiSearchController {

    private final AiSearchService aiSearchService;

    @PostMapping("/search")
    public ResponseEntity<SearchResponse> search(
            @Valid @RequestBody SearchRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(
                aiSearchService.search(request, userDetails.getUsername())
        );
    }

    @GetMapping("/history")
    public ResponseEntity<Object> history(
            @AuthenticationPrincipal UserDetails userDetails,
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(
                aiSearchService.getHistory(userDetails.getUsername(), limit)
        );
    }

    /** Explications de l'IA pour les meilleurs résultats (appel séparé, ne bloque pas l'affichage). */
    @PostMapping("/explain")
    public ResponseEntity<java.util.Map<String, String>> explain(@RequestBody ExplainRequest request) {
        return ResponseEntity.ok(aiSearchService.explain(request.query(), request.actorIds()));
    }

    @PostMapping("/feedback")
    public ResponseEntity<Void> feedback(@RequestBody FeedbackRequest request,
                                         @AuthenticationPrincipal UserDetails userDetails) {
        aiSearchService.feedback(userDetails.getUsername(), request.query(), request.actorId(), request.decision(), request.roleId());
        return ResponseEntity.noContent().build();
    }

    public record FeedbackRequest(String query, java.util.UUID actorId, String decision, java.util.UUID roleId) {}

    public record ExplainRequest(String query, java.util.List<java.util.UUID> actorIds) {}
}
