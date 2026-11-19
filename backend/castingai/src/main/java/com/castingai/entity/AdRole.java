package com.castingai.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/** T-163 · Fiche de rôle de la V2 : l'intention du réalisateur et les critères ; devient un rôle de casting à la publication. */
@Entity
@Table(name = "ad_roles")
@Getter @Setter @NoArgsConstructor
public class AdRole {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "request_id", nullable = false) private AdRequest request;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "character_id") private AdCharacter character;
    @Column(nullable = false) private int position;
    @Column(nullable = false, length = 120) private String name;
    @Column(columnDefinition = "TEXT") private String intention;
    @Column(length = 10) private String gender;
    @Column(name = "min_age") private Integer minAge;
    @Column(name = "max_age") private Integer maxAge;
    @Column(columnDefinition = "TEXT") private String appearance;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 12) private CastingRole.Importance importance = CastingRole.Importance.SECONDAIRE;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "casting_role_id") private CastingRole castingRole;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @PrePersist void onCreate() { createdAt = LocalDateTime.now(); }
}
