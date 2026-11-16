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

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Key implements Serializable {
        private UUID projectId;
        private UUID userId;
    }
}
