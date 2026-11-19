package com.castingai.repository;

import com.castingai.entity.AdEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AdEventRepository extends JpaRepository<AdEvent, UUID> {
    List<AdEvent> findByRequestIdOrderByCreatedAtDesc(UUID requestId);
}
