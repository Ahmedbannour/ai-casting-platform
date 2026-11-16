package com.castingai.dto.project;

import com.castingai.entity.Project;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/** Données échangées par l'API des projets. */
public final class ProjectDtos {

    private ProjectDtos() {}

    public record ProjectRequest(
            @NotBlank(message = "Le titre est obligatoire") @Size(max = 160, message = "Titre : 160 caractères au plus") String title,
            @NotNull(message = "Le type de projet est obligatoire") Project.Type type,
            String description,
            LocalDate startDate,
            LocalDate endDate) {}

    public record ProjectResponse(
            UUID id,
            String title,
            Project.Type type,
            String description,
            LocalDate startDate,
            LocalDate endDate,
            Project.Status status,
            String ownerName,
            boolean owner,
            long rolesCount,
            long rolesFilled,
            LocalDateTime createdAt,
            LocalDateTime updatedAt) {}
}
