package com.castingai.live;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

/** Pouls de la plateforme : les pages ouvertes l'interrogent toutes les quelques secondes. */
@RestController
@RequestMapping("/api/me/pulse")
@RequiredArgsConstructor
public class PulseController {

    private final ActivityClock clock;

    @GetMapping
    public ActivityClock.Pulse pulse(@AuthenticationPrincipal UserDetails me,
                                     @RequestParam(defaultValue = "-1") long since) {
        return clock.pulse(me.getUsername(), since);
    }
}
