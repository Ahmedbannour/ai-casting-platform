package com.castingai.controller;

import com.castingai.service.OfferService;
import com.castingai.service.OfferService.MyOffer;
import com.castingai.service.OfferService.OfferRow;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** T-095 · Propositions de rôle et convocations : l'agent envoie, l'acteur répond. */
@RestController
@RequiredArgsConstructor
public class OfferController {

    private final OfferService offers;

    public record SendRequest(@NotBlank(message = "Choisissez : proposition de rôle ou convocation") String kind,
                              @Size(max = 1000, message = "Message : 1000 caractères au plus") String message,
                              LocalDate auditionDate,
                              java.time.LocalTime auditionTime,
                              @Size(max = 200, message = "Lieu : 200 caractères au plus") String auditionPlace) {}

    public record AnswerRequest(@NotBlank(message = "Répondez : ACCEPTEE ou DECLINEE") String answer,
                                @Size(max = 500, message = "Mot pour l'agence : 500 caractères au plus") String note) {}

    @PostMapping("/api/shortlist/{entryId}/offers")
    public ResponseEntity<OfferRow> send(@AuthenticationPrincipal UserDetails me, @PathVariable UUID entryId,
                                         @Valid @RequestBody SendRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(offers.send(me.getUsername(), entryId, req.kind(), req.message(), req.auditionDate(), req.auditionTime(), req.auditionPlace()));
    }

    @GetMapping("/api/roles/{roleId}/offers")
    public List<OfferRow> forRole(@AuthenticationPrincipal UserDetails me, @PathVariable UUID roleId) {
        return offers.forRole(me.getUsername(), roleId);
    }

    @DeleteMapping("/api/offers/{id}")
    public ResponseEntity<Void> cancel(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) {
        offers.cancel(me.getUsername(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/me/offers")
    public List<MyOffer> mine(@AuthenticationPrincipal UserDetails me) {
        return offers.mine(me.getUsername());
    }

    @PutMapping("/api/me/offers/{id}")
    public ResponseEntity<Void> answer(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id,
                                       @Valid @RequestBody AnswerRequest req) {
        offers.answer(me.getUsername(), id, req.answer(), req.note());
        return ResponseEntity.noContent().build();
    }
}
