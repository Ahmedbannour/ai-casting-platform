package com.castingai.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Set;

/**
 * Le contrat ouvre l'accès : un agent dont l'agence n'a pas de contrat actif (pas encore commencé, échu,
 * ou agent sans agence) garde la lecture, mais ne peut plus rien créer, modifier ni lancer de recherche IA.
 * Les écritures de l'espace personnel (/api/me) et la déconnexion restent permises.
 */
@Component
@RequiredArgsConstructor
public class ContractGuardFilter extends OncePerRequestFilter {

    private static final Set<String> READ = Set.of("GET", "HEAD", "OPTIONS");

    private final JdbcTemplate jdbc;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest req) {
        String uri = req.getRequestURI();
        return READ.contains(req.getMethod()) || !uri.startsWith("/api/")
                || uri.startsWith("/api/auth/") || uri.startsWith("/api/me");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean agent = auth != null && auth.getAuthorities().stream().anyMatch(a -> "ROLE_BOITE_PROD".equals(a.getAuthority()));
        if (agent) {
            List<String> status = jdbc.queryForList("""
                select case when a.id is null then 'SANS_AGENCE'
                            when a.contract_start > current_date then 'A_VENIR'
                            when a.contract_end is not null and a.contract_end < current_date then 'EXPIRE'
                            else 'ACTIF' end
                from users u left join agencies a on a.id = u.agency_id
                where u.email = ?""", String.class, auth.getName());
            String s = status.isEmpty() ? "SANS_AGENCE" : status.get(0);
            if (!"ACTIF".equals(s)) {
                String why = switch (s) {
                    case "EXPIRE" -> "Le contrat de votre agence a pris fin";
                    case "A_VENIR" -> "Le contrat de votre agence n'a pas encore commencé";
                    default -> "Votre compte n'est rattaché à aucune agence sous contrat";
                };
                res.setStatus(403);
                res.setContentType("application/json;charset=UTF-8");
                res.getWriter().write("{\"status\":403,\"code\":\"CONTRAT_INACTIF\",\"message\":\"" + why
                        + " : accès en lecture seule. Contactez la plateforme pour le renouveler.\"}");
                return;
            }
        }
        chain.doFilter(req, res);
    }
}
