package com.castingai.repository;

import com.castingai.entity.ActorComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ActorCommentRepository extends JpaRepository<ActorComment, UUID> {

    List<ActorComment> findByActorIdOrderByCreatedAtDesc(UUID actorId);

    Optional<ActorComment> findByIdAndActorId(UUID id, UUID actorId);
}