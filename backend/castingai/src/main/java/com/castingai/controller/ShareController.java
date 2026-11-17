package com.castingai.controller;

import com.castingai.service.ShareService;
import com.castingai.service.ShareService.PublicShare;
import com.castingai.service.ShareService.ShareRow;
import com.castingai.service.ShareService.VoteRow;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Validation par le réalisateur.
 * L'agent crée un lien secret pour un rôle ; le réalisateur l'ouvre sans compte,
 * voit les candidats sans leurs coordonnées et donne son avis sur chacun.
 */
@RestController
@RequiredArgsConstructor
public class ShareController {

    private final ShareService shares;

    public record CreateShareRequest(@Size(max = 80, message = "Libellé : 80 caractères au plus") String label,
                                     @Min(value = 1, message = "Durée : 1 jour au moins")
                                     @Max(value = 90, message = "Durée : 90 jours au plus") Integer days) {}

    public record VoteRequest(@NotBlank(message = "Choisissez un avis") String vote,
                              @Size(max = 1000, message = "Commentaire : 1000 caractères au plus") String comment,
                              @NotBlank(message = "Indiquez votre nom")
                              @Size(max = 80, message = "Nom : 80 caractères au plus") String voterName) {}

    // ── Côté agence (connecté) ──

    @PostMapping("/api/roles/{roleId}/shares")
    public ResponseEntity<ShareRow> create(@AuthenticationPrincipal UserDetails me, @PathVariable UUID roleId,
                                           @Valid @RequestBody CreateShareRequest req) {
        int days = req.days() == null ? 14 : req.days();
        return ResponseEntity.status(HttpStatus.CREATED).body(shares.create(me.getUsername(), roleId, req.label(), days));
    }

    @GetMapping("/api/roles/{roleId}/shares")
    public List<ShareRow> list(@AuthenticationPrincipal UserDetails me, @PathVariable UUID roleId) {
        return shares.list(me.getUsername(), roleId);
    }

    @DeleteMapping("/api/shares/{id}")
    public ResponseEntity<Void> revoke(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) {
        shares.revoke(me.getUsername(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/roles/{roleId}/votes")
    public List<VoteRow> votes(@AuthenticationPrincipal UserDetails me, @PathVariable UUID roleId) {
        return shares.votes(me.getUsername(), roleId);
    }

    // ── Côté réalisateur (public, par lien) ──

    @GetMapping("/api/public/shares/{token}")
    public PublicShare view(@PathVariable String token) {
        return shares.view(token);
    }

    @PutMapping("/api/public/shares/{token}/votes/{entryId}")
    public ResponseEntity<Void> vote(@PathVariable String token, @PathVariable UUID entryId,
                                     @Valid @RequestBody VoteRequest req) {
        shares.vote(token, entryId, req.vote(), req.comment(), req.voterName());
        return ResponseEntity.noContent().build();
    }
}
