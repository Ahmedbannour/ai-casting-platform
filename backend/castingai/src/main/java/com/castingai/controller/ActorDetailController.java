package com.castingai.controller;

import com.castingai.dto.actor.ActorDetailResponse;
import com.castingai.dto.actor.CommentDto;
import com.castingai.dto.actor.CommentRequest;
import com.castingai.service.ActorDetailService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * REST controller for actor detail page.
 */
@RestController
@RequestMapping("/api/actors/{actorId}")
@RequiredArgsConstructor
public class ActorDetailController {

    private final ActorDetailService actorDetailService;

    @GetMapping("/detail")
    public ResponseEntity<ActorDetailResponse> getDetail(@PathVariable UUID actorId) {
        return ResponseEntity.ok(actorDetailService.getDetail(actorId));
    }

    @GetMapping("/comments")
    public ResponseEntity<List<CommentDto>> getComments(@PathVariable UUID actorId) {
        return ResponseEntity.ok(actorDetailService.getComments(actorId));
    }

    @PostMapping("/comments")
    public ResponseEntity<CommentDto> addComment(
            @PathVariable UUID actorId,
            @Valid @RequestBody CommentRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(
                actorDetailService.addComment(actorId, request, userDetails.getUsername())
        );
    }

    @DeleteMapping("/comments/{commentId}")
    public ResponseEntity<Void> deleteComment(
            @PathVariable UUID actorId,
            @PathVariable UUID commentId) {
        actorDetailService.deleteComment(actorId, commentId);
        return ResponseEntity.noContent().build();
    }
}