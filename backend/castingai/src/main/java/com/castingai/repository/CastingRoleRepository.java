package com.castingai.repository;

import com.castingai.entity.CastingRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CastingRoleRepository extends JpaRepository<CastingRole, UUID> {
    List<CastingRole> findByProjectIdOrderByPositionAscCreatedAtAsc(UUID projectId);
    int countByProjectId(UUID projectId);
}
