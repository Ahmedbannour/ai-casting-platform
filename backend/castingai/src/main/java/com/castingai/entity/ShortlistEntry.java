package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/** Un acteur dans la shortlist d'un rôle, avec son statut dans le processus de casting. */
@Entity
@Table(name = "shortlist_entries")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShortlistEntry {

    public enum Status { PRESELECTIONNE, AUDITION, RAPPEL, CHOISI, REFUSE }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "role_id", nullable = false)
    private CastingRole role;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "actor_id", nullable = false)
    private Actor actor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private Status status = Status.PRESELECTIONNE;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(name = "audition_date")
    private LocalDate auditionDate;

    /** T-116 · Heure et lieu de l'audition. */
    @Column(name = "audition_time")
    private java.time.LocalTime auditionTime;

    @Column(name = "audition_place", length = 200)
    private String auditionPlace;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "added_by")
    private User addedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() { createdAt = updatedAt = LocalDateTime.now(); }

    @PreUpdate
    protected void onUpdate() { updatedAt = LocalDateTime.now(); }
}
