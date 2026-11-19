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
    private final com.castingai.security.ContractGuardFilter contractGuardFilter;
    private final UserDetailsServiceImpl userDetailsService;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(Customizer.withDefaults())
                // API sans état (jeton JWT dans l'en-tête Authorization, pas de cookie) : pas de CSRF.
                .csrf(csrf -> csrf.disable())
                // T-108 · En-têtes de sécurité sur toutes les réponses
                .headers(h -> h
                        .frameOptions(f -> f.deny())
                        .contentTypeOptions(Customizer.withDefaults())
                        .referrerPolicy(r -> r.policy(org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                        .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31_536_000))   // envoyé seulement en HTTPS
                        .permissionsPolicyHeader(pp -> pp.policy("camera=(), microphone=(), geolocation=(), payment=()"))
                        // L'API ne renvoie que du JSON : rien à charger, rien à afficher dans un cadre.
                        .addHeaderWriter(new org.springframework.security.web.header.writers.DelegatingRequestMatcherHeaderWriter(
                                org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher.withDefaults().matcher("/api/**"),
                                new org.springframework.security.web.header.writers.StaticHeadersWriter("Content-Security-Policy",
                                        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"))))
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)
                )
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(org.springframework.http.HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/api/auth/login", "/api/auth/register", "/api/auth/register-pro", "/api/auth/refresh", "/api/health",
                                "/api/auth/providers", "/api/auth/google", "/api/auth/facebook").permitAll()
                        .requestMatchers("/error").permitAll()
                        // Page de partage au réalisateur : accès par lien secret, sans compte
                        .requestMatchers("/api/public/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/media/**").permitAll()   // T-109 : la signature du lien fait foi
                        // Administration : comptes des agents, import de fichiers
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        // Espace personnel : tout compte connecté (l'acteur freelance n'a accès qu'à ceci)
                        .requestMatchers("/api/me/**", "/api/auth/logout").authenticated()
                        // Tout le reste (acteurs, projets, recherche IA…) : agence uniquement
                        .requestMatchers("/api/**").hasAnyRole("ADMIN", "BOITE_PROD", "REALISATEUR")
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
        // Après l'authentification : un agent sans contrat actif passe en lecture seule.
        http.addFilterAfter(contractGuardFilter, com.castingai.security.JwtAuthenticationFilter.class);


        return http.build();
    }


    /** Le garde de contrat ne tourne que dans la chaîne de sécurité (après l'authentification), pas en filtre web séparé. */
    @Bean
    public org.springframework.boot.web.servlet.FilterRegistrationBean<com.castingai.security.ContractGuardFilter> contractGuardRegistration(
            com.castingai.security.ContractGuardFilter f) {
        var reg = new org.springframework.boot.web.servlet.FilterRegistrationBean<>(f);
        reg.setEnabled(false);
        return reg;
    }

    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider(userDetailsService);   // Spring Security 7
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