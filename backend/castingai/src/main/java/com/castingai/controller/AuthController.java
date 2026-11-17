package com.castingai.controller;

import com.castingai.dto.auth.AuthResponse;
import com.castingai.dto.LoginRequest;
import com.castingai.dto.auth.RefreshTokenRequest;
import com.castingai.dto.RegisterRequest;
import com.castingai.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

/**
 * REST controller for authentication endpoints.
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final com.castingai.service.SocialAuthService socialAuth;

    public record TokenRequest(@jakarta.validation.constraints.NotBlank(message = "Jeton manquant") String token) {}

    /** Fournisseurs de connexion configurés (identifiants publics uniquement). */
    @GetMapping("/providers")
    public com.castingai.service.SocialAuthService.Providers providers() {
        return socialAuth.providers();
    }

    @PostMapping("/google")
    public ResponseEntity<AuthResponse> google(@Valid @RequestBody TokenRequest req) {
        return ResponseEntity.ok(socialAuth.google(req.token()));
    }

    @PostMapping("/facebook")
    public ResponseEntity<AuthResponse> facebook(@Valid @RequestBody TokenRequest req) {
        return ResponseEntity.ok(socialAuth.facebook(req.token()));
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(request));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request,
                                              jakarta.servlet.http.HttpServletRequest http) {
        // Adresse de la machine : celle vue par le serveur (un proxy de confiance devra transmettre l'adresse réelle).
        return ResponseEntity.ok(authService.login(request, com.castingai.security.ClientIp.of(http)));
    }

    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ResponseEntity.ok(authService.refresh(request));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@AuthenticationPrincipal UserDetails userDetails) {
        authService.logout(userDetails.getUsername());
        return ResponseEntity.noContent().build();
    }
}