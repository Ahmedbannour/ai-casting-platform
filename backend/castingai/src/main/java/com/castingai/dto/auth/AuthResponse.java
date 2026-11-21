package com.castingai.dto.auth;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AuthResponse {
    private String accessToken;
    private String refreshToken;
    private String tokenType;
    private String email;
    private String firstName;
    private String lastName;
    private String role;
    /** Assistante de production : ce que le producer lui autorise (tout pour le producer). */
    private java.util.List<String> perms;
}