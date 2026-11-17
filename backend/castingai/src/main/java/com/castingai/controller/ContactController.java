package com.castingai.controller;

import com.castingai.entity.Actor;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.ForbiddenException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.ActorRepository;
import com.castingai.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * T-094 · Coordonnées protégées.
 * Un agent sous contrat demande le téléphone et l'e-mail d'une fiche du vivier : la consultation est tracée,
 * et l'acteur voit dans son espace quelle agence les a consultés et quand.
 * (Contrat inactif : le filtre de contrat refuse déjà ce POST ; autre agence : l'intercepteur répond 404.)
 */
@RestController
@RequiredArgsConstructor
public class ContactController {

    private final ActorRepository actors;
    private final UserRepository users;
    private final JdbcTemplate jdbc;
    private final com.castingai.service.NotificationService notifications;

    public record Contact(String phone, String email) {}
    /** viewedAt : instant en millisecondes, affiché à l'heure locale du navigateur. */
    public record ContactView(String who, long viewedAt) {}

    @PostMapping("/api/actors/{actorId}/contact")
    @Transactional
    public Contact reveal(@AuthenticationPrincipal UserDetails principal, @PathVariable UUID actorId) {
        User me = users.findByEmail(principal.getUsername()).orElseThrow();
        Actor a = actors.findById(actorId).orElseThrow(() -> new ResourceNotFoundException("Acteur introuvable"));
        jdbc.update("insert into contact_views (id, actor_id, viewer_id, agency_id) values (?, ?, ?, ?)",
                UUID.randomUUID(), a.getId(), me.getId(), me.getAgency() == null ? null : me.getAgency().getId());
        if (a.getAccount() != null) {
            notifications.push(a.getAccount().getId(), "COORDONNEES",
                    (me.getAgency() == null ? "La plateforme" : me.getAgency().getName()) + " a consulté vos coordonnées",
                    "Vous pouvez voir l'historique des consultations dans votre profil.", "/mon-profil");
        }
        return new Contact(a.getPhone(), a.getEmail());
    }

    /** L'acteur voit qui a consulté ses coordonnées (les 50 dernières consultations). */
    @GetMapping("/api/me/contact-views")
    @Transactional(readOnly = true)
    public List<ContactView> myViews(@AuthenticationPrincipal UserDetails principal) {
        User me = users.findByEmail(principal.getUsername()).orElseThrow();
        if (me.getRole() != Role.ACTEUR) throw new ForbiddenException("Réservé aux comptes acteur");
        return jdbc.query("""
            select coalesce(ag.name, case when u.role = 'ADMIN' then 'La plateforme' else 'Une agence' end) as who,
                   (extract(epoch from (v.viewed_at at time zone current_setting('TimeZone'))) * 1000)::bigint as at
              from contact_views v
              join actors a on a.id = v.actor_id
              left join agencies ag on ag.id = v.agency_id
              left join users u on u.id = v.viewer_id
             where a.user_id = ?
             order by v.viewed_at desc
             limit 50
            """, (rs, i) -> new ContactView(rs.getString(1), rs.getLong(2)), me.getId());
    }
}
