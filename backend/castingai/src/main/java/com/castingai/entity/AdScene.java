package com.castingai.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

/** T-163 · Une scène du découpage de la V2. */
@Entity
@Table(name = "ad_scenes")
@Getter @Setter @NoArgsConstructor
public class AdScene {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "request_id", nullable = false) private AdRequest request;
    @Column(nullable = false) private int position;
    @Column(nullable = false, length = 160) private String title;
    @Column(columnDefinition = "TEXT") private String description;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @PrePersist void onCreate() { createdAt = LocalDateTime.now(); }
}
