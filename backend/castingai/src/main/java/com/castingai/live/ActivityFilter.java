package com.castingai.live;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/** Avance l'horloge d'activité après chaque écriture réussie sur l'API. */
@Component
@Order(Ordered.LOWEST_PRECEDENCE)
@RequiredArgsConstructor
public class ActivityFilter extends OncePerRequestFilter {

    /** Écritures sans effet pour les autres : lecture des notifications, recherche IA, connexion… */
    private static final List<String> QUIET = List.of(
            "/api/me/notifications", "/api/me/pulse", "/api/ai/", "/api/auth/", "/api/public/auth");

    private final ActivityClock clock;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        String m = req.getMethod();
        if ("GET".equals(m) || "HEAD".equals(m) || "OPTIONS".equals(m)) return true;
        String p = req.getRequestURI();
        if (!p.startsWith("/api/")) return true;
        return QUIET.stream().anyMatch(p::startsWith);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        chain.doFilter(req, res);
        int status = res.getStatus();
        if (status >= 200 && status < 400) {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            clock.tick(auth == null ? null : auth.getName());
        }
    }
}
