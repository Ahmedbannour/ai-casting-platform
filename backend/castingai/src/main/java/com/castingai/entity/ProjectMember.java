package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.UUID;

/** Collègue invité sur un projet (lecture seule côté API jusqu'au sprint S6). */
@Entity
@Table(name = "project_members")
@IdClass(ProjectMember.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ProjectMember {

    @Id
    @Column(name = "project_id")
    private UUID projectId;

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "added_at", nullable = false)
    private LocalDateTime addedAt;

    /* Room de casting : autorisations du membre (le chef de room les règle). */
    @Column(name = "can_swipe", nullable = false)
    private boolean canSwipe = true;
    @Column(name = "can_results", nullable = false)
    private boolean canResults = true;
    @Column(name = "can_docs", nullable = false)
    private boolean canDocs = false;
    @Column(name = "can_tasks", nullable = false)
    private boolean canTasks = false;
    @Column(name = "room_lead", nullable = false)
    private boolean roomLead = false;

    public ProjectMember(UUID projectId, UUID userId, LocalDateTime addedAt) {
        this.projectId = projectId; this.userId = userId; this.addedAt = addedAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Key implements Serializable {
        private UUID projectId;
        private UUID userId;
    }
}
