package com.castingai.service;

import com.castingai.entity.User;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

/**
 * Flux iCalendar personnel des auditions : Google Agenda, Outlook ou le téléphone s'y abonnent une fois,
 * puis récupèrent seuls les nouvelles auditions et leurs changements (heure, lieu, annulation).
 */
@Service
@RequiredArgsConstructor
public class CalendarFeedService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter LOCAL = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss");

    private final JdbcTemplate jdbc;
    private final AccessService access;
    private final UserRepository users;
    private final AgendaService agenda;

    public record Feed(String token) {}

    /** Le jeton du flux (créé au premier appel). */
    @Transactional
    public Feed feed(String email) {
        User me = access.user(email);
        List<String> t = jdbc.queryForList("select token from calendar_feeds where user_id = ?", String.class, me.getId());
        return new Feed(t.isEmpty() ? renew(me.getId()) : t.get(0));
    }

    /** Nouveau jeton : l'ancien lien cesse de fonctionner (lien partagé par erreur). */
    @Transactional
    public Feed regenerate(String email) {
        return new Feed(renew(access.user(email).getId()));
    }

    private String renew(UUID userId) {
        byte[] raw = new byte[24];
        RANDOM.nextBytes(raw);
        String token = HexFormat.of().formatHex(raw);
        jdbc.update("insert into calendar_feeds (user_id, token) values (?, ?) on conflict (user_id) do update set token = excluded.token, created_at = now()", userId, token);
        return token;
    }

    /** Le calendrier lui-même, pour Google Agenda et Outlook : 30 jours passés, 12 mois à venir. */
    @Transactional(readOnly = true)
    public String ics(String token) {
        if (token == null || !token.matches("[0-9a-f]{48}")) throw new ResourceNotFoundException("Agenda introuvable");
        List<UUID> ids = jdbc.queryForList("select user_id from calendar_feeds where token = ?", UUID.class, token);
        if (ids.isEmpty()) throw new ResourceNotFoundException("Agenda introuvable");
        User u = users.findById(ids.get(0)).filter(User::isEnabled).orElseThrow(() -> new ResourceNotFoundException("Agenda introuvable"));
        boolean actor = u.getRole() == com.castingai.entity.Role.ACTEUR;
        LocalDate today = LocalDate.now();
        StringBuilder b = new StringBuilder();
        line(b, "BEGIN:VCALENDAR"); line(b, "VERSION:2.0"); line(b, "PRODID:-//Cercle//Agenda des auditions//FR");
        line(b, "CALSCALE:GREGORIAN"); line(b, "METHOD:PUBLISH");
        line(b, "X-WR-CALNAME:" + esc(actor ? "Mes auditions · Cercle" : "Auditions · Cercle"));
        line(b, "X-WR-TIMEZONE:Africa/Tunis");
        line(b, "REFRESH-INTERVAL;VALUE=DURATION:PT1H"); line(b, "X-PUBLISHED-TTL:PT1H");
        // La Tunisie est à UTC+1 toute l'année
        line(b, "BEGIN:VTIMEZONE"); line(b, "TZID:Africa/Tunis"); line(b, "BEGIN:STANDARD"); line(b, "DTSTART:19700101T000000");
        line(b, "TZOFFSETFROM:+0100"); line(b, "TZOFFSETTO:+0100"); line(b, "TZNAME:CET"); line(b, "END:STANDARD"); line(b, "END:VTIMEZONE");
        String stamp = LocalDateTime.now(ZoneOffset.UTC).format(LOCAL) + "Z";
        for (AgendaService.Item it : agenda.agenda(u.getEmail(), today.minusDays(30), today.plusDays(365))) {
            line(b, "BEGIN:VEVENT");
            line(b, "UID:" + it.entryId() + (it.pending() ? "-convocation" : "") + "@cercle");
            line(b, "DTSTAMP:" + stamp);
            if (it.time() == null) {
                line(b, "DTSTART;VALUE=DATE:" + it.date().format(DAY));
                line(b, "DTEND;VALUE=DATE:" + it.date().plusDays(1).format(DAY));
            } else {
                LocalDateTime start = it.date().atTime(it.time());
                line(b, "DTSTART;TZID=Africa/Tunis:" + start.format(LOCAL));
                line(b, "DTEND;TZID=Africa/Tunis:" + start.plusHours(1).format(LOCAL));
            }
            String title = (it.pending() ? "[À confirmer] " : "") + "Audition · " + (actor ? it.roleName() : it.actorName() + " (" + it.roleName() + ")");
            line(b, "SUMMARY:" + esc(title));
            if (it.place() != null) line(b, "LOCATION:" + esc(it.place()));
            line(b, "DESCRIPTION:" + esc(it.projectTitle() + " · " + it.agencyName()
                    + ("RAPPEL".equals(it.status()) ? " · Rappel (2e tour)" : "") + (it.pending() ? " · en attente de la réponse de l'acteur" : "")));
            line(b, "STATUS:" + (it.pending() ? "TENTATIVE" : "CONFIRMED"));
            line(b, "BEGIN:VALARM"); line(b, "TRIGGER:-PT2H"); line(b, "ACTION:DISPLAY"); line(b, "DESCRIPTION:" + esc(title)); line(b, "END:VALARM");
            line(b, "END:VEVENT");
        }
        line(b, "END:VCALENDAR");
        return b.toString();
    }

    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n");
    }

    /** Lignes iCalendar : fin CRLF, repliées à 75 octets. */
    private static void line(StringBuilder b, String l) {
        byte[] bytes = l.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        if (bytes.length <= 75) { b.append(l).append("\r\n"); return; }
        StringBuilder cur = new StringBuilder(); int len = 0; boolean first = true;
        for (int i = 0; i < l.length(); ) {
            int cp = l.codePointAt(i); String ch = new String(Character.toChars(cp));
            int n = ch.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
            if (len + n > (first ? 75 : 74)) { b.append(cur).append("\r\n "); cur.setLength(0); len = 0; first = false; }
            cur.append(ch); len += n; i += Character.charCount(cp);
        }
        b.append(cur).append("\r\n");
    }
}
