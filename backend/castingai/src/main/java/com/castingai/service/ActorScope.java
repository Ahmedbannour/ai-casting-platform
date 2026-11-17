package com.castingai.service;

import com.castingai.entity.Actor;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * T-092 · Quelles fiches d'acteurs l'utilisateur connecté peut voir.
 * L'administrateur voit tout. Un agent voit le vivier de la plateforme (agency_id nul)
 * et les fiches apportées par sa propre agence, jamais celles d'une autre agence.
 */
@Service
@RequiredArgsConstructor
public class ActorScope {

    /** Valeur neutre pour « aucune agence » : PostgreSQL ne sait pas typer un paramètre nul. */
    public static final UUID NONE = new UUID(0L, 0L);

    private final UserRepository users;
    private final JdbcTemplate jdbc;

    public record Scope(boolean all, UUID agency) {}

    /** Portée de l'utilisateur connecté (aucun utilisateur : vivier seul). */
    @Transactional(readOnly = true)
    public Scope current() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null) return new Scope(false, NONE);
        return users.findByEmail(auth.getName()).map(this::of).orElse(new Scope(false, NONE));
    }

    public Scope of(User u) {
        if (u.getRole() == Role.ADMIN) return new Scope(true, NONE);
        return new Scope(false, u.getAgency() == null ? NONE : u.getAgency().getId());
    }

    /**
     * T-094 · L'utilisateur connecté voit-il directement le téléphone et l'e-mail ?
     * Oui pour l'administrateur, l'acteur sur sa propre fiche et l'agence qui a apporté la fiche.
     * Sinon (vivier), il doit les demander : la consultation est tracée.
     */
    @Transactional(readOnly = true)
    public boolean seesContact(Actor a) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getName() == null) return false;
        User u = users.findByEmail(auth.getName()).orElse(null);
        if (u == null) return false;
        if (u.getRole() == Role.ADMIN) return true;
        if (u.getRole() == Role.ACTEUR) return a.getAccount() != null && a.getAccount().getId().equals(u.getId());
        return u.getAgency() != null && u.getAgency().getId().equals(a.getAgencyId());
    }

    /** L'utilisateur connecté peut-il voir cette fiche ? (fiche inexistante : true, le 404 vient ensuite) */
    public boolean canSee(UUID actorId) {
        Scope s = current();
        if (s.all()) return true;
        UUID agency = jdbc.query("select agency_id from actors where id = ?",
                rs -> rs.next() ? (UUID) rs.getObject(1) : NONE, actorId);
        if (NONE.equals(agency)) return true;          // fiche inconnue ou vivier
        return agency == null || agency.equals(s.agency());
    }
}
