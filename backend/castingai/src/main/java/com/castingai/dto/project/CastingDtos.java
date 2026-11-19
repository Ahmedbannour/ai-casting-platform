package com.castingai.dto.project;

import com.castingai.entity.CastingRole;
import com.castingai.entity.ShortlistEntry;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Données échangées par l'API des rôles et des shortlists (MVP, sprints S4 et S5). */
public final class CastingDtos {

    private CastingDtos() {}

    public record RoleRequest(
            @NotBlank(message = "Le nom du rôle est obligatoire") @Size(max = 120) String name,
            String description,
            @Size(max = 4000, message = "L'intention du réalisateur ne dépasse pas 4000 caractères") String intention,
            String gender,
            @Min(value = 0, message = "Âge minimum invalide") @Max(value = 120, message = "Âge minimum invalide") Integer minAge,
            @Min(value = 0, message = "Âge maximum invalide") @Max(value = 120, message = "Âge maximum invalide") Integer maxAge,
            List<String> languages,
            List<String> skills,
            String city,
            LocalDate shootStart,
            LocalDate shootEnd,
            CastingRole.Importance importance) {}

    public record RoleResponse(
            UUID id,
            UUID projectId,
            String projectTitle,
            String name,
            String description,
            String intention,
            String gender,
            Integer minAge,
            Integer maxAge,
            List<String> languages,
            List<String> skills,
            String city,
            LocalDate shootStart,
            LocalDate shootEnd,
            CastingRole.Importance importance,
            int position,
            boolean filled,
            long shortlistCount,
            Map<String, Long> countByStatus,
            String intentionQuery) {}

    public record AddToShortlistRequest(@NotNull(message = "Acteur manquant") UUID actorId) {}

    public record UpdateEntryRequest(
            ShortlistEntry.Status status,
            String note,
            LocalDate auditionDate,
            Boolean replaceChosen,
            /** Vrai pour effacer la date d'audition (null seul signifie « inchangée »). */
            Boolean clearAudition) {}

    public record EntryResponse(
            UUID id,
            UUID roleId,
            UUID actorId,
            String firstName,
            String lastName,
            Integer age,
            String city,
            String gender,
            @tools.jackson.databind.annotation.JsonSerialize(using = com.castingai.storage.MediaUrls.Signed.class) String photoUrl,
            ShortlistEntry.Status status,
            String note,
            LocalDate auditionDate,
            LocalDateTime createdAt,
            LocalDateTime updatedAt,
            /** Disponibilité pour les dates de tournage du rôle : OK, A_VERIFIER, ou null si inconnue (US-07). */
            String availability,
            String availabilityNote,
            /** L'acteur s'est mis en pause : il n'apparaît plus aux réalisateurs (T-093). */
            boolean paused,
            /** L'acteur a un compte : on peut lui envoyer une proposition (T-095). */
            boolean hasAccount) {}
}
