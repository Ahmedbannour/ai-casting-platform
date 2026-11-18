package com.castingai.controller;

import com.castingai.service.AgencyHomeService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** T-143 · Accueil de l'agent (agence et administrateur). */
@RestController
@RequiredArgsConstructor
public class AgencyHomeController {

    private final AgencyHomeService service;

    @GetMapping("/api/agency/home")
    public AgencyHomeService.Home home(@AuthenticationPrincipal UserDetails me) {
        return service.home(me.getUsername());
    }
}
