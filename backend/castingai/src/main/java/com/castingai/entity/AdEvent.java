package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/** Cahier v2 · Ligne du journal d'une demande (création, envoi, révision…). */
@Entity
@Table(name = "ad_events")
@Getter @Setter @NoArgsConstructor
public class AdEvent {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "request_id", nullable = false)
    private AdRequest request;

    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "actor_id")
    private User actor;

    @Column(nullable = false, length = 30) private String type;
    @Column(nullable = false, length = 400) private String message;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;

    @PrePersist void onCreate() { createdAt = LocalDateTime.now(); }
}
