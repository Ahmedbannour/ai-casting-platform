package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/** Cahier v2 · Une version d'une demande (V0 de la marque, V1 de l'agence, V2 du réalisateur). Livrée = figée. */
@Entity
@Table(name = "ad_versions")
@Getter @Setter @NoArgsConstructor
public class AdVersion {

    public enum Kind { V0, V1, V2 }
    public enum Status { BROUILLON, LIVREE, A_REVISER }

    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "request_id", nullable = false)
    private AdRequest request;

    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 4) private Kind kind;
    /** « V0 », « V1 », « V1.1 »… */
    @Column(nullable = false, length = 10) private String label;

    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "author_id")
    private User author;

    @Column(columnDefinition = "TEXT") private String body;
    @Column(name = "file_key", length = 300) private String fileKey;
    @Column(name = "file_name", length = 255) private String fileName;
    @Column(name = "file_type", length = 120) private String fileType;
    @Column(name = "file_size") private Long fileSize;

    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 12)
    private Status status = Status.BROUILLON;

    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @Column(name = "delivered_at") private LocalDateTime deliveredAt;
    /** T-161 · Commentaire de la marque quand elle renvoie la version en révision. */
    @Column(name = "review_comment", columnDefinition = "TEXT") private String reviewComment;
    @Column(name = "reviewed_at") private LocalDateTime reviewedAt;

    @PrePersist void onCreate() { createdAt = LocalDateTime.now(); }
}
