package com.castingai.config;

import com.castingai.security.JwtAuthenticationFilter;
import com.castingai.security.UserDetailsServiceImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final UserDetailsServiceImpl userDetailsService;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(Customizer.withDefaults()) // 🔥 AJOUTE CETTE LIGNE ICI
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                )
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(org.springframework.http.HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/api/auth/login", "/api/auth/register", "/api/auth/refresh", "/api/health",
                                "/api/auth/providers", "/api/auth/google", "/api/auth/facebook").permitAll()
                        .requestMatchers("/error").permitAll()
                        // Administration : comptes des agents, import de fichiers
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        // Espace personnel : tout compte connecté (l'acteur freelance n'a accès qu'à ceci)
                        .requestMatchers("/api/me/**", "/api/auth/logout").authenticated()
                        // Tout le reste (acteurs, projets, recherche IA…) : agence uniquement
                        .requestMatchers("/api/**").hasAnyRole("ADMIN", "AGENT")
                        .anyRequest().authenticated()
                )
                // Réponses JSON claires : 401 sans jeton valide, 403 sans droit
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> {
                            res.setStatus(401);
                            res.setContentType("application/json");
                            res.getWriter().write("{\"status\":401,\"message\":\"Authentification requise\"}");
                        })
                        .accessDeniedHandler((req, res, e) -> {
                            res.setStatus(403);
                            res.setContentType("application/json");
                            res.getWriter().write("{\"status\":403,\"message\":\"Accès refusé\"}");
                        })
                );

        http.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);


        return http.build();
    }


    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder());
        // Mot de passe vérifié AVANT l'état du compte : sans le bon mot de passe,
        // on ne révèle pas qu'un compte existe et qu'il est désactivé.
        provider.setPreAuthenticationChecks(user -> {});
        provider.setPostAuthenticationChecks(user -> {
            if (!user.isEnabled()) {
                throw new org.springframework.security.authentication.DisabledException("Compte désactivé");
            }
        });
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}