package com.castingai.repository;

import com.castingai.entity.AdRole;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AdRoleRepository extends JpaRepository<AdRole, UUID> {
    List<AdRole> findByRequestIdOrderByPositionAscCreatedAtAsc(UUID requestId);
    long countByRequestId(UUID requestId);
}
