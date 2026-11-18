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
