package com.castingai.repository;

import com.castingai.entity.ShortlistEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ShortlistEntryRepository extends JpaRepository<ShortlistEntry, UUID> {

    @Query("select e from ShortlistEntry e join fetch e.actor where e.role.id = :roleId order by e.createdAt asc")
    List<ShortlistEntry> findByRoleWithActor(@Param("roleId") UUID roleId);

    Optional<ShortlistEntry> findByRoleIdAndActorId(UUID roleId, UUID actorId);

    Optional<ShortlistEntry> findFirstByRoleIdAndStatus(UUID roleId, ShortlistEntry.Status status);

    boolean existsByRoleIdAndStatus(UUID roleId, ShortlistEntry.Status status);

    /** Nombre d'acteurs par statut pour une liste de rôles : [role_id, status, total]. */
    @Query("select e.role.id, e.status, count(e) from ShortlistEntry e where e.role.id in :roleIds group by e.role.id, e.status")
    List<Object[]> countByStatus(@Param("roleIds") List<UUID> roleIds);
}
