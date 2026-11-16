package com.castingai.repository;

import com.castingai.entity.AiFeedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface AiFeedbackRepository extends JpaRepository<AiFeedback, UUID> {

    long countByDecision(String decision);
}
