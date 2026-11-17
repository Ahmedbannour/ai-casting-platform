package com.castingai.repository;

import com.castingai.entity.Agency;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface AgencyRepository extends JpaRepository<Agency, UUID> {
    boolean existsByNameIgnoreCase(String name);
}
