package com.castingai.controller;

import com.castingai.service.AgendaService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** T-116 · Agenda des auditions (agent, administrateur, acteur). */
@RestController
@RequiredArgsConstructor
public class AgendaController {

    private final AgendaService agenda;
    private final com.castingai.service.CalendarFeedService feeds;

    /** Flux d'agenda personnel, pour s'abonner depuis Google Agenda ou Outlook. */
    @GetMapping("/api/me/agenda/flux")
    public com.castingai.service.CalendarFeedService.Feed feed(@AuthenticationPrincipal UserDetails me) { return feeds.feed(me.getUsername()); }

    @PostMapping("/api/me/agenda/flux")
    public com.castingai.service.CalendarFeedService.Feed regenerate(@AuthenticationPrincipal UserDetails me) { return feeds.regenerate(me.getUsername()); }

    /** Le flux lui-même : public, protégé par son jeton secret (Google et Outlook n'envoient pas d'identifiants). */
    @GetMapping(value = "/api/public/agenda/{token}.ics", produces = "text/calendar;charset=UTF-8")
    public org.springframework.http.ResponseEntity<String> ics(@PathVariable String token) {
        return org.springframework.http.ResponseEntity.ok()
                .header("Content-Disposition", "inline; filename=\"cercle-auditions.ics\"")
                .cacheControl(org.springframework.http.CacheControl.noCache())
                .body(feeds.ics(token));
    }

    @GetMapping({"/api/me/agenda", "/api/agenda"})
    public List<AgendaService.Item> list(@AuthenticationPrincipal UserDetails me,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return agenda.agenda(me.getUsername(), from, to);
    }

    /** Envoie tout de suite les rappels d'un jour donné (par défaut : demain). Administrateur seulement. */
    @PostMapping("/api/admin/agenda/rappels")
    public Map<String, Integer> remind(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day) {
        return Map.of("envoyes", agenda.remind(day == null ? LocalDate.now().plusDays(1) : day));
    }
}
