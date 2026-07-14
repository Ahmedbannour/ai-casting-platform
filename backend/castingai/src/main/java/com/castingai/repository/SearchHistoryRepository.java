package com.castingai.repository;

import com.castingai.entity.SearchHistory;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface SearchHistoryRepository extends JpaRepository<SearchHistory, UUID> {

    List<SearchHistory> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);
}