package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "actor_documents")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ActorDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id", nullable = false)
    private Actor actor;

    @Column(nullable = false)
    private String name;

    @Column(name = "original_name", nullable = false)
    private String originalName;

    @Column
    private String type;

    @Column(nullable = false)
    private String url;

    @Column
    private Long size;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() { createdAt = LocalDateTime.now(); }
}