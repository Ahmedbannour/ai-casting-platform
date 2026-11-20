package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/** Rôle d'un projet : le profil recherché (table casting_roles, pour ne pas confondre avec les rôles utilisateurs). */
@Entity
@Table(name = "casting_roles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CastingRole {

    public enum Importance { PRINCIPAL, SECONDAIRE, FIGURATION }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    /** Intention du réalisateur pour ce rôle (cahier v2) : le point de départ des propositions d'acteurs. */
    @Column(columnDefinition = "TEXT")
    private String intention;

    @Column(length = 10)
    private String gender;

    @Column(name = "min_age")
    private Integer minAge;

    @Column(name = "max_age")
    private Integer maxAge;

    /** Langues séparées par des virgules. */
    @Column(columnDefinition = "TEXT")
    private String languages;

    /** Compétences séparées par des virgules. */
    @Column(columnDefinition = "TEXT")
    private String skills;

    @Column(length = 100)
    private String city;

    /** T-165 · Pour un rôle de figuration : le type demandé (EXTRA, SILHOUETTE, FIGURANT_SPECIAL) ; null = tout figurant. */
    @Column(name = "figuration_type", length = 20)
    private String figurationType;

    @Column(name = "shoot_start")
    private LocalDate shootStart;

    @Column(name = "shoot_end")
    private LocalDate shootEnd;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    @Builder.Default
    private Importance importance = Importance.SECONDAIRE;

    @Column(nullable = false)
    @Builder.Default
    private int position = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean filled = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() { createdAt = updatedAt = LocalDateTime.now(); }

    @PreUpdate
    protected void onUpdate() { updatedAt = LocalDateTime.now(); }
}
