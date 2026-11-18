package com.castingai.controller;

import com.castingai.service.AuditService;
import com.castingai.service.RetentionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** T-111 · Administration : règles de conservation, dernière purge, purge à la demande. */
@RestController
@RequiredArgsConstructor
public class RetentionController {

    private final RetentionService retention;
    private final AuditService audit;

    @GetMapping("/api/admin/retention")
    public Map<String, Object> rules() {
        List<Map<String, String>> rules = RetentionService.RULES.stream()
                .map(r -> Map.of("key", r.key(), "label", r.label(), "duration", r.duration())).toList();
        Map<String, Object> out = new HashMap<>();
        out.put("rules", rules);
        out.put("schedule", "Chaque nuit à 3 h 30");
        out.put("last", retention.last());
        return out;
    }

    @PostMapping("/api/admin/retention/run")
    public RetentionService.Report run() {
        RetentionService.Report r = retention.run("Purge lancée par l'administrateur");
        if (r.total() == 0) audit.log("PURGE_CONSERVATION", "Purge lancée par l'administrateur", "Rien à effacer");
        return r;
    }
}
