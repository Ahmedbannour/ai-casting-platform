package com.castingai.repository;

import com.castingai.entity.ActorDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ActorDocumentRepository extends JpaRepository<ActorDocument, UUID> {

    List<ActorDocument> findByActorIdOrderByCreatedAtDesc(UUID actorId);

    Optional<ActorDocument> findByIdAndActorId(UUID id, UUID actorId);
}