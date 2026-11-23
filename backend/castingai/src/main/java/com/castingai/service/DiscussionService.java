package com.castingai.service;

import com.castingai.entity.AdRequest;
import com.castingai.entity.User;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Discussion d'un projet de publicité : toute l'équipe (marque, agence, production, réalisateur, 1er AD)
 * échange au même endroit ; une @mention prévient la personne dans sa cloche.
 */
@Service
@RequiredArgsConstructor
public class DiscussionService {

    private final JdbcTemplate jdbc;
    private final AccessService access;
    private final DemandeService demandes;
    private final NotificationService notifications;

    public record Person(UUID id, String name, String side) {}
    public record Comment(UUID id, UUID authorId, String authorName, String side, String body, List<UUID> mentions, LocalDateTime createdAt, boolean mine) {}
    public record Thread(List<Person> people, List<Comment> comments) {}
    public record Post(@NotBlank(message = "Écrivez un message") @Size(max = 2000, message = "2 000 caractères au plus") String body, List<UUID> mentions) {}

    @Transactional(readOnly = true)
    public Thread thread(String email, UUID id) {
        User me = access.user(email);
        AdRequest r = demandes.visibleTo(me, id);
        List<Person> people = people(r);
        Map<UUID, Person> byId = new HashMap<>();
        people.forEach(p -> byId.put(p.id(), p));
        List<Comment> comments = jdbc.query("""
                select c.id, c.author_id, coalesce(u.first_name || ' ' || u.last_name, 'Compte supprimé'), c.body, c.mentions, c.created_at
                  from demande_comments c left join users u on u.id = c.author_id
                 where c.request_id = ? order by c.created_at asc limit 300""",
                (rs, i) -> {
                    UUID author = (UUID) rs.getObject(2);
                    Person p = author == null ? null : byId.get(author);
                    Timestamp t = rs.getTimestamp(6);
                    return new Comment((UUID) rs.getObject(1), author, rs.getString(3).trim(), p == null ? null : p.side(), rs.getString(4),
                            ids(rs.getString(5)), t.toLocalDateTime(), author != null && author.equals(me.getId()));
                }, r.getId());
        return new Thread(people, comments);
    }

    @Transactional
    public Thread post(String email, UUID id, Post req) {
        User me = access.user(email);
        AdRequest r = demandes.visibleTo(me, id);
        String body = req.body().trim();
        if (body.isEmpty()) throw new IllegalArgumentException("Écrivez un message");
        Set<UUID> team = new HashSet<>(people(r).stream().map(Person::id).toList());
        List<UUID> mentions = req.mentions() == null ? List.of()
                : req.mentions().stream().filter(Objects::nonNull).distinct().filter(team::contains).filter(u -> !u.equals(me.getId())).limit(20).toList();
        jdbc.update("insert into demande_comments (id, request_id, author_id, body, mentions) values (?, ?, ?, ?, ?)",
                UUID.randomUUID(), r.getId(), me.getId(), body, mentions.isEmpty() ? null : String.join(",", mentions.stream().map(UUID::toString).toList()));
        String who = (me.getFirstName() + " " + me.getLastName()).trim();
        String extract = body.length() > 180 ? body.substring(0, 177) + "…" : body;
        for (UUID u : mentions)
            notifications.push(u, "MENTION", who + " vous mentionne · " + r.getTitle(), extract, "/demandes/" + r.getId() + "#discussion");
        return thread(email, id);
    }

    /** Toute l'équipe de la publicité : comptes actifs des trois organisations, réalisateur et 1er AD. */
    private List<Person> people(AdRequest r) {
        List<Person> out = new ArrayList<>();
        Set<UUID> seen = new HashSet<>();
        addOrg(out, seen, r.getBrand() == null ? null : r.getBrand().getId(), "Marque");
        addOrg(out, seen, r.getAgency() == null ? null : r.getAgency().getId(), "Agence");
        addOrg(out, seen, r.getProduction() == null ? null : r.getProduction().getId(), "Production");
        for (User u : new User[]{ r.getDirector(), r.getFirstAd() })
            if (u != null && seen.add(u.getId()))
                out.add(new Person(u.getId(), (u.getFirstName() + " " + u.getLastName()).trim(), r.getDirector() != null && u.getId().equals(r.getDirector().getId()) ? "Réalisation" : "1er AD"));
        return out;
    }

    private void addOrg(List<Person> out, Set<UUID> seen, UUID org, String side) {
        if (org == null) return;
        jdbc.query("select id, first_name || ' ' || last_name from users where agency_id = ? and enabled = true order by first_name",
                rs -> { UUID id = (UUID) rs.getObject(1); if (seen.add(id)) out.add(new Person(id, rs.getString(2).trim(), side)); }, org);
    }

    private static List<UUID> ids(String csv) {
        if (csv == null || csv.isBlank()) return List.of();
        return Arrays.stream(csv.split(",")).map(String::trim).filter(x -> !x.isEmpty()).map(UUID::fromString).toList();
    }
}
