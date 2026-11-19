package com.castingai.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/** T-162 · Un personnage de la publicité et ce que la marque et l'agence souhaitent y voir, saisi par la production. */
@Entity
@Table(name = "ad_characters")
@Getter @Setter @NoArgsConstructor
public class AdCharacter {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "request_id", nullable = false)
    private AdRequest request;

    @Column(nullable = false) private int position;
    @Column(nullable = false, length = 120) private String name;
    /** Sa place dans l'histoire. */
    @Column(columnDefinition = "TEXT") private String story;
    @Column(name = "brand_wish", columnDefinition = "TEXT") private String brandWish;
    @Column(name = "agency_wish", columnDefinition = "TEXT") private String agencyWish;
    /** Remarques de la production (contraintes, disponibilités, figuration…). */
    @Column(columnDefinition = "TEXT") private String notes;

    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", nullable = false) private LocalDateTime updatedAt;

    @PrePersist void onCreate() { createdAt = updatedAt = LocalDateTime.now(); }
    @PreUpdate void onUpdate() { updatedAt = LocalDateTime.now(); }
}
