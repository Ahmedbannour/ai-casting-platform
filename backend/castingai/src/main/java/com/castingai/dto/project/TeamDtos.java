package com.castingai.dto.project;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDateTime;
import java.util.UUID;

/** Équipe d'un projet et journal d'activité (MVP, sprint S6 · US-04 et US-17). */
public final class TeamDtos {

    private TeamDtos() {}

    public record AddMemberRequest(
            @NotBlank(message = "Adresse e-mail obligatoire") @Email(message = "Adresse e-mail invalide") String email) {}

    public record MemberResponse(UUID userId, String name, String email, boolean owner, LocalDateTime addedAt) {}

    public record ActivityItem(
            LocalDateTime at,
            String userName,
            UUID actorId,
            String actorName,
            UUID roleId,
            String roleName,
            String fromStatus,
            String toStatus) {}
}
