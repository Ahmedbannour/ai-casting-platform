package com.castingai.service;

import com.castingai.config.JwtConfig;
import com.castingai.dto.auth.AuthResponse;
import com.castingai.dto.LoginRequest;
import com.castingai.dto.auth.RefreshTokenRequest;
import com.castingai.dto.RegisterRequest;
import com.castingai.entity.RefreshToken;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.AuthException;
import com.castingai.repository.RefreshTokenRepository;
import com.castingai.repository.UserRepository;
import com.castingai.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Implementation of AuthService — handles register, login, refresh, logout.
 */
@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final AuthenticationManager authenticationManager;
    private final PasswordEncoder passwordEncoder;
    private final JwtConfig jwtConfig;
    private final ActorAccountService actorAccounts;
    private final LoginAttemptService loginAttempts;
    private final ConsentService consents;

    @Override
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        String email = request.getEmail().trim().toLowerCase();
        var consent = new ConsentService.Request(request.getAcceptTerms(), request.getAge(), request.getGuardianName());
        ConsentService.validate(consent);   // T-101 : aucun compte sans accord aux conditions
        if (userRepository.existsByEmail(email)) {
            throw new com.castingai.exception.ConflictException("Un compte existe déjà avec cette adresse e-mail");
        }

        // Inscription publique = acteur freelance : son compte et sa fiche sont créés ensemble.
        User user = User.builder()
                .email(email)
                .password(passwordEncoder.encode(request.getPassword()))
                .firstName(request.getFirstName().trim())
                .lastName(request.getLastName().trim())
                .role(Role.ACTEUR)
                .enabled(true)
                .build();
        userRepository.saveAndFlush(user);
        var fiche = actorAccounts.createFicheFor(user, "INSCRIPTION");
        if (request.getFiguration() != null) {
            fiche.setFiguration(com.castingai.entity.Figuration.toColumn(request.getFiguration()));
        }
        consents.record(user.getId(), consent, "INSCRIPTION");

        return buildAuthResponse(user);
    }

    @Override
    @Transactional
    public AuthResponse login(LoginRequest request) {
        return login(request, null);
    }

    /** T-107 · Connexion avec limitation des essais en série (par adresse et par machine). */
    @Override
    @Transactional(noRollbackFor = org.springframework.security.core.AuthenticationException.class)
    public AuthResponse login(LoginRequest request, String clientIp) {
        loginAttempts.checkAllowed(request.getEmail(), clientIp);
        userRepository.findByEmail(request.getEmail() == null ? "" : request.getEmail().trim().toLowerCase())
                .filter(User::isPendingApproval)
                .ifPresent(u -> { throw new com.castingai.exception.ForbiddenException(
                        "Votre compte attend la validation de l'équipe AI Casting. Vous recevrez l'accès dès qu'il sera validé."); });
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
            );
        } catch (org.springframework.security.authentication.BadCredentialsException e) {
            loginAttempts.onFailure(request.getEmail(), clientIp);
            throw e;
        }
        loginAttempts.onSuccess(request.getEmail());

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new AuthException("User not found"));

        return buildAuthResponse(user);
    }

    @Override
    @Transactional
    public AuthResponse refresh(RefreshTokenRequest request) {
        RefreshToken refreshToken = refreshTokenRepository.findByToken(request.getRefreshToken())
                .orElseThrow(() -> new AuthException("Invalid refresh token"));

        if (!refreshToken.isValid()) {
            refreshTokenRepository.delete(refreshToken);
            throw new AuthException("Refresh token has expired");
        }

        // Rotation : le jeton utilisé n'est plus valable
        refreshTokenRepository.delete(refreshToken);
        return buildAuthResponse(refreshToken.getUser());
    }

    @Override
    @Transactional
    public void logout(String email) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AuthException("User not found"));
        refreshTokenRepository.deleteByUser(user);
    }

    /**
     * Builds auth response with new access and refresh tokens.
     */
    @Override
    public AuthResponse buildAuthResponse(User user) {
        String accessToken = jwtTokenProvider.generateAccessToken(user);
        String rawRefreshToken = UUID.randomUUID().toString();

        // Plusieurs sessions possibles : on ne supprime que les jetons expirés de cet utilisateur
        refreshTokenRepository.deleteByUserAndExpiresAtBefore(user, LocalDateTime.now());

        RefreshToken refreshToken = RefreshToken.builder()
                .token(rawRefreshToken)
                .user(user)
                .expiresAt(LocalDateTime.now().plusSeconds(
                        jwtConfig.getRefreshTokenExpiration() / 1000
                ))
                .build();

        refreshTokenRepository.save(refreshToken);

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(rawRefreshToken)
                .tokenType("Bearer")
                .email(user.getEmail())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .role(user.getRole().name())
                .build();
    }
}