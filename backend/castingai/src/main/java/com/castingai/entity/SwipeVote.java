package com.castingai.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

/** Vote d'un membre de la room sur un candidat de la shortlist (swipe). */
@Entity
@Table(name = "swipe_votes")
@Getter @Setter @NoArgsConstructor
public class SwipeVote {
    public enum Vote { NON, OUI, COEUR }
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(name = "entry_id", nullable = false)
    private UUID entryId;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "user_id", nullable = false)
    private User user;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 8)
    private Vote vote;
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
