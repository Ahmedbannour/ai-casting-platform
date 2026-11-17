package com.castingai.controller;

import com.castingai.exception.ForbiddenException;
import com.castingai.repository.UserRepository;
import com.castingai.service.EmailVerificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** T-113 · Vérification de l'adresse e-mail : lien créé par l'administrateur, ouvert sans connexion. */
@RestController
@RequiredArgsConstructor
public class EmailVerificationController {

    private final EmailVerificationService verifications;
    private final UserRepository users;

    @PostMapping("/api/admin/users/{id}/email-verification")
    public ResponseEntity<EmailVerificationService.Created> create(@PathVariable UUID id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(verifications.create(id));
    }

    @PostMapping("/api/public/email-verification/{token}")
    public EmailVerificationService.Result confirm(@PathVariable String token) {
        return verifications.confirm(token);
    }

    @GetMapping("/api/me/email")
    public EmailVerificationService.Status mine(@AuthenticationPrincipal UserDetails me) {
        if (me == null) throw new ForbiddenException("Connexion requise");
        return verifications.status(users.findByEmail(me.getUsername()).orElseThrow(() -> new ForbiddenException("Compte introuvable")));
    }
}
