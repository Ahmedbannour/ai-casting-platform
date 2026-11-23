package com.castingai.controller;

import com.castingai.service.DiscussionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** P3 · Discussion du projet : lire, écrire, mentionner. */
@RestController
@RequestMapping("/api/demandes/{id}/discussion")
@RequiredArgsConstructor
public class DiscussionController {

    private final DiscussionService discussion;

    @GetMapping
    public DiscussionService.Thread thread(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) {
        return discussion.thread(me.getUsername(), id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DiscussionService.Thread post(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody DiscussionService.Post req) {
        return discussion.post(me.getUsername(), id, req);
    }
}
