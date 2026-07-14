package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

@Entity
@Table(name = "actor_experiences")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ActorExperience {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id", nullable = false)
    private Actor actor;

    @Column(nullable = false)
    private String title;

    private String production;

    private String role;

    private Integer year;

    @Column(columnDefinition = "TEXT")
    private String description;
}