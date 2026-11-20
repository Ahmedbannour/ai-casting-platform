package com.castingai.repository;

import com.castingai.entity.RoomDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface RoomDocumentRepository extends JpaRepository<RoomDocument, UUID> {
    List<RoomDocument> findByProjectIdOrderByUpdatedAtDesc(UUID projectId);
}
