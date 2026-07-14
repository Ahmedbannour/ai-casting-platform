package com.castingai.security;

import com.castingai.config.JwtConfig;
import io.jsonwebtoken.*;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Date;

/**
 * Handles JWT token generation and validation.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class JwtTokenProvider {

    private final JwtConfig jwtConfig;

    /**
     * Generates an access token for the given user.
     */
    public String generateAccessToken(UserDetails userDetails) {
        Date now = new Date();
        Date exp = new Date(System.currentTimeMillis() + jwtConfig.getAccessTokenExpiration());

        System.out.println("NOW = " + now);
        System.out.println("EXP = " + exp);
        System.out.println("ACCESS TOKEN EXPIRATION = " + jwtConfig.getAccessTokenExpiration());

        System.out.println("CONFIG = " + jwtConfig);
        System.out.println("EXP = " + jwtConfig.getAccessTokenExpiration());


        return Jwts.builder()
                .subject(userDetails.getUsername())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + jwtConfig.getAccessTokenExpiration()))
                .signWith(getSigningKey())
                .compact();
    }


    /**
     * Extracts the username (email) from a token.
     */
    public String extractUsername(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .getSubject();
    }

    /**
     * Validates a token against the given user details.
     */
    public boolean isTokenValid(String token, UserDetails userDetails) {
        try {
            final String username = extractUsername(token);
            return username.equals(userDetails.getUsername())/* && !isTokenExpired(token)*/;
        } catch (JwtException | IllegalArgumentException e) {
            log.error("JWT validation error: {}", e.getMessage());
            return false;
        }
    }

    private boolean isTokenExpired(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .getExpiration()
                .before(new Date());
    }

    private SecretKey getSigningKey() {
        byte[] keyBytes = Decoders.BASE64.decode(jwtConfig.getSecret());
        return Keys.hmacShaKeyFor(keyBytes);
    }
}