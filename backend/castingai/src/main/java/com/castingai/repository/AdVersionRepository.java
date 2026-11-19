package com.castingai.repository;

import com.castingai.entity.AdVersion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AdVersionRepository extends JpaRepository<AdVersion, UUID> {
    List<AdVersion> findByRequestIdOrderByCreatedAtAsc(UUID requestId);
    Optional<AdVersion> findFirstByRequestIdAndKindOrderByCreatedAtDesc(UUID requestId, AdVersion.Kind kind);
}
