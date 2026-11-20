package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/** Tâche de la room : un titre, une personne, une date, trois états. */
@Entity
@Table(name = "room_tasks")
@Getter @Setter @NoArgsConstructor
public class RoomTask {
    public enum Status { A_FAIRE, EN_COURS, FAIT }
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(name = "project_id", nullable = false)
    private UUID projectId;
    @Column(nullable = false, length = 200)
    private String title;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "assignee_id")
    private User assignee;
    @Column(name = "due_date")
    private LocalDate dueDate;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 12)
    private Status status = Status.A_FAIRE;
    @Column(nullable = false)
    private int position = 0;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "created_by")
    private User createdBy;
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}
