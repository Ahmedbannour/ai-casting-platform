package com.castingai.repository;

import com.castingai.entity.Project;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ProjectRepository extends JpaRepository<Project, UUID> {

    /** Projets visibles : ceux dont l'utilisateur est propriétaire ou membre (tous si admin). */
    @Query("""
        select p from Project p join fetch p.owner o
        where (:admin = true or o.id = :userId
               or exists (select 1 from ProjectMember m where m.projectId = p.id and m.userId = :userId))
          and (:status is null or p.status = :status)
        order by p.updatedAt desc
        """)
    List<Project> findVisible(@Param("userId") UUID userId, @Param("admin") boolean admin,
                              @Param("status") Project.Status status);

    /** Nombre de rôles et de rôles pourvus par projet : [project_id, total, pourvus]. */
    @Query(value = """
        select project_id, count(*) as total, count(*) filter (where filled) as pourvus
        from casting_roles where project_id in (:ids) group by project_id
        """, nativeQuery = true)
    List<Object[]> countRoles(@Param("ids") List<UUID> ids);

    @Query(value = "select count(*) > 0 from project_members where project_id = :projectId and user_id = :userId",
           nativeQuery = true)
    boolean isMember(@Param("projectId") UUID projectId, @Param("userId") UUID userId);
}
