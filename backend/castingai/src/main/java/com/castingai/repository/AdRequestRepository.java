package com.castingai.repository;

import com.castingai.entity.AdRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface AdRequestRepository extends JpaRepository<AdRequest, UUID> {
    @Query("select r from AdRequest r where r.createdBy.id = :userId or (:orgId is not null and r.brand.id = :orgId) order by r.updatedAt desc")
    List<AdRequest> forBrand(UUID userId, UUID orgId);

    @Query("select r from AdRequest r where r.agency.id = :orgId and r.status <> com.castingai.entity.AdRequest.Status.BROUILLON order by r.updatedAt desc")
    List<AdRequest> forAgency(UUID orgId);

    /** T-161 · Demandes confiées à une boîte de production (après validation de la V1). */
    @Query("select r from AdRequest r where r.production.id = :orgId order by r.updatedAt desc")
    List<AdRequest> forProduction(UUID orgId);

    /** T-162 · Demandes transmises à un réalisateur ou à un 1er AD. */
    @Query("select r from AdRequest r left join r.director d left join r.firstAd f where d.id = :userId or f.id = :userId order by r.updatedAt desc")
    List<AdRequest> forDirector(UUID userId);

    List<AdRequest> findAllByOrderByUpdatedAtDesc();

    /** P-083 · La demande dont est issue une room (la room porte l'identifiant du projet). */
    java.util.Optional<AdRequest> findFirstByProjectId(UUID projectId);
}
