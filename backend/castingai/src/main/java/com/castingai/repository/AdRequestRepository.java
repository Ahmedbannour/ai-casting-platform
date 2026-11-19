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

    List<AdRequest> findAllByOrderByUpdatedAtDesc();
}
