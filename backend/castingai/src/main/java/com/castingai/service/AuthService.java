package com.castingai.service;

import com.castingai.dto.auth.AuthResponse;
import com.castingai.dto.LoginRequest;
import com.castingai.dto.auth.RefreshTokenRequest;
import com.castingai.dto.RegisterRequest;

/**
 * Authentication service interface.
 */
public interface AuthService {

    AuthResponse register(RegisterRequest request);

    AuthResponse login(LoginRequest request);

    AuthResponse refresh(RefreshTokenRequest request);

    void logout(String email);
}