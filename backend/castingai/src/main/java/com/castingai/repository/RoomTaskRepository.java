package com.castingai.repository;

import com.castingai.entity.RoomTask;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface RoomTaskRepository extends JpaRepository<RoomTask, UUID> {
    List<RoomTask> findByProjectIdOrderByPositionAscCreatedAtAsc(UUID projectId);
    long countByProjectIdAndStatus(UUID projectId, RoomTask.Status status);
}
