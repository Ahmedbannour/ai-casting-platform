package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/** Agence cliente, liée à la plateforme par un contrat. */
@Entity
@Table(name = "agencies")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Agency {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 160)
    private String name;

    private String city;

    @Column(name = "contact_email")
    private String contactEmail;

    @Column(name = "contract_start", nullable = false)
    private LocalDate contractStart;

    @Column(name = "contract_end")
    private LocalDate contractEnd;

    @Column(name = "max_agents")
    private Integer maxAgents;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() { createdAt = LocalDateTime.now(); updatedAt = createdAt; }

    @PreUpdate
    protected void onUpdate() { updatedAt = LocalDateTime.now(); }

    /** ACTIF, A_VENIR ou EXPIRE, d'après les dates du contrat. */
    public String contractStatus() {
        LocalDate today = LocalDate.now();
        if (contractStart.isAfter(today)) return "A_VENIR";
        if (contractEnd != null && contractEnd.isBefore(today)) return "EXPIRE";
        return "ACTIF";
    }
}
