package com.castingai.controller;

import com.castingai.service.PasswordResetService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/** T-112 · Lien de réinitialisation : créé par l'administrateur, ouvert sans connexion par la personne. */
@RestController
@RequiredArgsConstructor
public class PasswordResetController {

    private final PasswordResetService resets;

    @PostMapping("/api/admin/users/{id}/password-reset")
    public ResponseEntity<PasswordResetService.Created> create(@PathVariable UUID id) {
        return ResponseEntity.status(HttpStatus.CREATED).body(resets.create(id));
    }

    @GetMapping("/api/public/password-reset/{token}")
    public PasswordResetService.Preview preview(@PathVariable String token) {
        return resets.preview(token);
    }

    @PostMapping("/api/public/password-reset/{token}")
    public ResponseEntity<Void> reset(@PathVariable String token, @RequestBody Map<String, String> body) {
        resets.reset(token, body == null ? null : body.get("password"));
        return ResponseEntity.noContent().build();
    }
}
