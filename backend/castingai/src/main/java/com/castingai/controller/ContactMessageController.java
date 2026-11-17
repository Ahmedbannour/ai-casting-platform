package com.castingai.controller;

import com.castingai.service.ContactMessageService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Formulaire de contact de la vitrine (public) et sa lecture par l'administrateur. */
@RestController
@RequiredArgsConstructor
public class ContactMessageController {

    private final ContactMessageService messages;

    @PostMapping("/api/public/contact")
    public ResponseEntity<Map<String, Boolean>> submit(@RequestBody ContactMessageService.Request body, HttpServletRequest req) {
        messages.submit(body, req.getRemoteAddr());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("ok", true));
    }

    @GetMapping("/api/admin/contact-messages")
    public Map<String, Object> list(@RequestParam(defaultValue = "100") int limit) {
        List<ContactMessageService.Message> items = messages.list(limit);
        return Map.of("unread", messages.unread(), "items", items);
    }

    @PostMapping("/api/admin/contact-messages/{id}/read")
    public ResponseEntity<Void> read(@PathVariable UUID id) {
        messages.markRead(id);
        return ResponseEntity.noContent().build();
    }
}
