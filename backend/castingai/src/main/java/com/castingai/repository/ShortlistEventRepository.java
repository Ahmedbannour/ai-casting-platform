package com.castingai.repository;

import com.castingai.entity.ShortlistEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface ShortlistEventRepository extends JpaRepository<ShortlistEvent, UUID> {
}
