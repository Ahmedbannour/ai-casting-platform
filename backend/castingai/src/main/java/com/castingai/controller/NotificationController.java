package com.castingai.controller;

import com.castingai.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** T-096 · Cloche de notifications de l'utilisateur connecté. */
@RestController
@RequestMapping("/api/me/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notifications;

    @GetMapping
    public NotificationService.Feed feed(@AuthenticationPrincipal UserDetails me) {
        return notifications.feed(me.getUsername());
    }

    @PostMapping("/read")
    public ResponseEntity<Void> readAll(@AuthenticationPrincipal UserDetails me) {
        notifications.readAll(me.getUsername());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<Void> read(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) {
        notifications.read(me.getUsername(), id);
        return ResponseEntity.noContent().build();
    }
}
