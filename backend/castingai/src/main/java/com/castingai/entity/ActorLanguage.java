package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

@Entity
@Table(name = "actor_languages")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ActorLanguage {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id", nullable = false)
    private Actor actor;

    @Column(nullable = false)
    private String name;

    private String level;
}