package com.castingai.repository;

import com.castingai.entity.AdCharacter;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AdCharacterRepository extends JpaRepository<AdCharacter, UUID> {
    List<AdCharacter> findByRequestIdOrderByPositionAscCreatedAtAsc(UUID requestId);
    long countByRequestId(UUID requestId);
}
