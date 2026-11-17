package com.castingai.controller;

import com.castingai.dto.auth.AuthResponse;
import com.castingai.entity.User;
import com.castingai.exception.ForbiddenException;
import com.castingai.repository.UserRepository;
import com.castingai.service.InvitationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** T-102 · Invitation des acteurs : l'agence crée le lien, l'acteur l'ouvre sans être connecté. */
@RestController
@RequiredArgsConstructor
public class InvitationController {

    private final InvitationService invitations;
    private final UserRepository users;

    @GetMapping("/api/actors/{id}/invitation")
    public InvitationService.Status status(@PathVariable UUID id, @AuthenticationPrincipal UserDetails me) {
        return invitations.status(id, user(me));
    }

    @PostMapping("/api/actors/{id}/invitation")
    public ResponseEntity<InvitationService.Created> create(@PathVariable UUID id, @AuthenticationPrincipal UserDetails me) {
        return ResponseEntity.status(HttpStatus.CREATED).body(invitations.create(id, user(me)));
    }

    @DeleteMapping("/api/actors/{id}/invitation")
    public ResponseEntity<Void> revoke(@PathVariable UUID id, @AuthenticationPrincipal UserDetails me) {
        invitations.revoke(id, user(me));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/public/invitations/{token}")
    public InvitationService.Preview preview(@PathVariable String token) {
        return invitations.preview(token);
    }

    @PostMapping("/api/public/invitations/{token}/accept")
    public ResponseEntity<AuthResponse> accept(@PathVariable String token, @RequestBody InvitationService.AcceptRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(invitations.accept(token, body));
    }

    private User user(UserDetails me) {
        if (me == null) throw new ForbiddenException("Connexion requise");
        return users.findByEmail(me.getUsername()).orElseThrow(() -> new ForbiddenException("Compte introuvable"));
    }
}
