package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/** Cahier v2 · Demande de publicité d'une marque : porte toute la chaîne V0 → V1 → V2 → casting → PPM. */
@Entity
@Table(name = "ad_requests")
@Getter @Setter @NoArgsConstructor
public class AdRequest {

    /** Étapes de la demande, dans l'ordre du cycle. */
    public enum Status { BROUILLON, V0_ENVOYEE, V1_EN_COURS, V1_LIVREE, V2_EN_COURS, V2_LIVREE, CASTING, PPM, ACTEURS_VALIDES, CLOTUREE, ANNULEE }

    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** Organisation de la marque (null pour une marque sans organisation, ex. compte créé à la main). */
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "brand_org_id")
    private Agency brand;

    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    /** Agence marketing choisie à l'envoi de la V0. */
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "agency_org_id")
    private Agency agency;

    @Column(nullable = false, length = 160) private String title;
    @Column(length = 160) private String product;
    @Column(columnDefinition = "TEXT") private String objective;
    @Column(columnDefinition = "TEXT") private String target;
    @Column(name = "key_message", columnDefinition = "TEXT") private String keyMessage;
    @Column(name = "air_date") private LocalDate airDate;

    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private Status status = Status.BROUILLON;

    /** T-160 · Analyse de la V0 pour l'agence. Listes enregistrées une ligne par élément. */
    @Column(name = "ai_summary", columnDefinition = "TEXT") private String aiSummary;
    @Column(name = "ai_missing", columnDefinition = "TEXT") private String aiMissing;
    @Column(name = "ai_questions", columnDefinition = "TEXT") private String aiQuestions;
    @Column(name = "ai_source", length = 10) private String aiSource;
    @Column(name = "ai_at") private LocalDateTime aiAt;

    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @Column(name = "updated_at", nullable = false) private LocalDateTime updatedAt;

    @PrePersist void onCreate() { createdAt = updatedAt = LocalDateTime.now(); }
    @PreUpdate void onUpdate() { updatedAt = LocalDateTime.now(); }
}
