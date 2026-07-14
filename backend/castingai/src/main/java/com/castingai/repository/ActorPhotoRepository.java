package com.castingai.repository;

import com.castingai.entity.ActorPhoto;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for ActorPhoto entity.
 */
@Repository
public interface ActorPhotoRepository extends JpaRepository<ActorPhoto, UUID> {

    List<ActorPhoto> findByActorIdOrderByIsMainDescCreatedAtDesc(UUID actorId);

    Optional<ActorPhoto> findByIdAndActorId(UUID id, UUID actorId);

    @Modifying
    @Query("UPDATE ActorPhoto p SET p.isMain = false WHERE p.actor.id = :actorId")
    void clearMainPhoto(@Param("actorId") UUID actorId);

    long countByActorId(UUID actorId);
}