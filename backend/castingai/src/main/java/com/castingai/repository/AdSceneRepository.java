package com.castingai.repository;

import com.castingai.entity.AdScene;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AdSceneRepository extends JpaRepository<AdScene, UUID> {
    List<AdScene> findByRequestIdOrderByPositionAscCreatedAtAsc(UUID requestId);
    long countByRequestId(UUID requestId);
}
