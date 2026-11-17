package com.castingai.controller;

import com.castingai.dto.actor.ActorResponse;
import com.castingai.dto.actor.ActorUpdateRequest;
import com.castingai.dto.photo.PhotoResponse;
import com.castingai.dto.photo.PhotoUploadResponse;
import com.castingai.entity.Actor;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.ForbiddenException;
import com.castingai.repository.ActorRepository;
import com.castingai.repository.UserRepository;
import com.castingai.service.ActorAccountService;
import com.castingai.service.ActorService;
import com.castingai.service.PhotoService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

/**
 * Espace personnel. Tout compte connecté lit son profil ;
 * l'acteur freelance y tient à jour sa propre fiche et ses photos (et rien d'autre).
 */
@RestController
@RequestMapping("/api/me")
@RequiredArgsConstructor
public class MeController {

    private final UserRepository users;
    private final ActorRepository actors;
    private final ActorAccountService accounts;
    private final ActorService actorService;
    private final com.castingai.service.ConsentService consents;
    private final PhotoService photoService;

    public record MeResponse(UUID id, String email, String firstName, String lastName, String role,
                             String provider, UUID actorId, String agencyName, String contractStatus,
                             java.time.LocalDate contractEnd) {}

    @GetMapping
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public MeResponse me(@AuthenticationPrincipal UserDetails principal) {
        User u = user(principal);
        UUID actorId = actors.findByAccount_Id(u.getId()).map(Actor::getId).orElse(null);
        var ag = u.getAgency();
        String contract = u.getRole() != Role.AGENT ? null : ag == null ? "SANS_AGENCE" : ag.contractStatus();
        return new MeResponse(u.getId(), u.getEmail(), u.getFirstName(), u.getLastName(), u.getRole().name(),
                u.getAuthProvider(), actorId, ag == null ? null : ag.getName(), contract, ag == null ? null : ag.getContractEnd());
    }

    public record VisibilityResponse(String visibility, java.time.LocalDateTime changedAt) {}
    public record VisibilityRequest(@jakarta.validation.constraints.NotNull(message = "Choisissez VISIBLE ou PAUSE")
                                    @jakarta.validation.constraints.Pattern(regexp = "VISIBLE|PAUSE", message = "Choisissez VISIBLE ou PAUSE")
                                    String visibility) {}

    /** Consentement de l'acteur : visible des agences sous contrat, ou en pause (T-093). */
    /** T-101 · L'utilisateur connecté a-t-il accepté la version en vigueur des conditions ? */
    @GetMapping("/consent")
    public com.castingai.service.ConsentService.Status consent(@AuthenticationPrincipal UserDetails principal) {
        return consents.status(user(principal).getId());
    }

    /** T-101 · Accord daté aux conditions et à la politique de confidentialité (comptes créés avec Google ou Facebook, nouvelle version). */
    @PostMapping("/consent")
    public com.castingai.service.ConsentService.Status acceptConsent(@AuthenticationPrincipal UserDetails principal,
                                                                     @RequestBody com.castingai.service.ConsentService.Request body) {
        return consents.record(user(principal).getId(), body, "CONNEXION");
    }

    @GetMapping("/visibility")
    @org.springframework.transaction.annotation.Transactional
    public VisibilityResponse myVisibility(@AuthenticationPrincipal UserDetails principal) {
        Actor a = actors.findById(myActorId(principal)).orElseThrow();
        return new VisibilityResponse(a.getVisibility(), a.getVisibilityChangedAt());
    }

    @PutMapping("/visibility")
    @org.springframework.transaction.annotation.Transactional
    public VisibilityResponse setMyVisibility(@AuthenticationPrincipal UserDetails principal,
                                              @Valid @RequestBody VisibilityRequest request) {
        Actor a = actors.findById(myActorId(principal)).orElseThrow();
        if (!request.visibility().equals(a.getVisibility())) {
            a.setVisibility(request.visibility());
            a.setVisibilityChangedAt(java.time.LocalDateTime.now());
            actors.save(a);
        }
        return new VisibilityResponse(a.getVisibility(), a.getVisibilityChangedAt());
    }

    @GetMapping("/actor")
    public ActorResponse myActor(@AuthenticationPrincipal UserDetails principal) {
        return actorService.findById(myActorId(principal));
    }

    @PutMapping("/actor")
    public ActorResponse updateMyActor(@AuthenticationPrincipal UserDetails principal,
                                       @Valid @RequestBody ActorUpdateRequest request) {
        return actorService.update(myActorId(principal), request);
    }

    @GetMapping("/photos")
    public List<PhotoResponse> myPhotos(@AuthenticationPrincipal UserDetails principal) {
        return photoService.findByActorId(myActorId(principal));
    }

    @PostMapping(value = "/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public PhotoUploadResponse upload(@AuthenticationPrincipal UserDetails principal,
                                      @RequestParam("files") MultipartFile[] files) throws Exception {
        return photoService.upload(myActorId(principal), files);
    }

    @PutMapping("/photos/{photoId}/main")
    public PhotoResponse setMain(@AuthenticationPrincipal UserDetails principal, @PathVariable UUID photoId) {
        return photoService.setMainPhoto(myActorId(principal), photoId);
    }

    @DeleteMapping("/photos/{photoId}")
    public ResponseEntity<Void> deletePhoto(@AuthenticationPrincipal UserDetails principal, @PathVariable UUID photoId) throws Exception {
        photoService.delete(myActorId(principal), photoId);
        return ResponseEntity.noContent().build();
    }

    // ── outils ──

    private User user(UserDetails principal) {
        return users.findByEmail(principal.getUsername()).orElseThrow(() -> new ForbiddenException("Compte introuvable"));
    }

    /** Fiche de l'acteur connecté ; créée au besoin. Réservé aux comptes acteur. */
    private UUID myActorId(UserDetails principal) {
        User u = user(principal);
        if (u.getRole() != Role.ACTEUR) {
            throw new ForbiddenException("L'espace « Mon profil » est réservé aux comptes acteur");
        }
        return accounts.createFicheFor(u, "INSCRIPTION").getId();
    }
}
