package com.castingai.config;

import com.castingai.service.ActorScope;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * T-092 · Toute route /api/actors/{id}/… (fiche, détail, photos, documents, commentaires)
 * répond 404 si la fiche appartient à une autre agence : on ne révèle pas son existence.
 */
@Configuration
@RequiredArgsConstructor
public class ActorAccessConfig implements WebMvcConfigurer {

    private final ActorScope scope;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler) throws Exception {
                UUID id = actorId(req.getRequestURI());
                if (id == null || scope.canSee(id)) return true;
                res.setStatus(HttpServletResponse.SC_NOT_FOUND);
                res.setContentType("application/json");
                res.setCharacterEncoding(StandardCharsets.UTF_8.name());
                res.getWriter().write("{\"status\":404,\"message\":\"Acteur introuvable\"}");
                return false;
            }
        }).addPathPatterns("/api/actors/*", "/api/actors/*/**");
    }

    private static UUID actorId(String uri) {
        String[] parts = uri.split("/");
        // ["", "api", "actors", "{id}", ...]
        if (parts.length < 4) return null;
        try { return UUID.fromString(parts[3]); } catch (IllegalArgumentException e) { return null; }
    }
}
