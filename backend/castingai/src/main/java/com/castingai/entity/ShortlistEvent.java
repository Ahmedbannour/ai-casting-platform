package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/** Changement de statut d'un acteur dans une shortlist (qui, quand, de quoi vers quoi). */
@Entity
@Table(name = "shortlist_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShortlistEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "entry_id", nullable = false)
    private UUID entryId;

    @Column(name = "from_status", length = 16)
    private String fromStatus;

    @Column(name = "to_status", nullable = false, length = 16)
    private String toStatus;

    @Column(name = "user_id")
    private UUID userId;

    @Column(nullable = false)
    private LocalDateTime at;

    @PrePersist
    protected void onCreate() { if (at == null) at = LocalDateTime.now(); }
}
