package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

/** Document partagé dans la room d'un projet, visible des rôles listés dans « audience ». */
@Entity
@Table(name = "room_documents")
@Getter @Setter @NoArgsConstructor
public class RoomDocument {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(name = "project_id", nullable = false)
    private UUID projectId;
    @Column(nullable = false, length = 200)
    private String name;
    @Column(name = "file_key", nullable = false, length = 400)
    private String fileKey;
    @Column(name = "file_type", length = 120)
    private String fileType;
    @Column(name = "file_size")
    private Long fileSize;
    /** Rôles qui voient le document, séparés par des virgules (MARQUE, AGENCE_MARKETING, REALISATEUR, BOITE_PROD). */
    @Column(nullable = false, length = 200)
    private String audience = "MARQUE,AGENCE_MARKETING,REALISATEUR,BOITE_PROD";
    @Column(nullable = false)
    private int version = 1;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "uploaded_by")
    private User uploadedBy;
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}
