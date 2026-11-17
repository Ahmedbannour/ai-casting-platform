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
    private final PhotoService photoService;

    public record MeResponse(UUID id, String email, String firstName, String lastName, String role,
                             String provider, UUID actorId) {}

    @GetMapping
    public MeResponse me(@AuthenticationPrincipal UserDetails principal) {
        User u = user(principal);
        UUID actorId = actors.findByAccount_Id(u.getId()).map(Actor::getId).orElse(null);
        return new MeResponse(u.getId(), u.getEmail(), u.getFirstName(), u.getLastName(), u.getRole().name(),
                u.getAuthProvider(), actorId);
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
