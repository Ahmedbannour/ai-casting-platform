package com.castingai.service;

import com.castingai.dto.actor.DocumentResponse;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

public interface DocumentService {

    DocumentResponse upload(UUID actorId, MultipartFile file) throws Exception;

    List<DocumentResponse> findByActorId(UUID actorId);

    void delete(UUID actorId, UUID documentId) throws Exception;
}