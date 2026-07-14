package com.castingai.service;

import com.castingai.dto.actor.DocumentResponse;
import com.castingai.entity.ActorDocument;
import com.castingai.exception.ActorNotFoundException;
import com.castingai.repository.ActorDocumentRepository;
import com.castingai.repository.ActorRepository;
import com.castingai.storage.StorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

/**
 * Handles actor document upload and management via MinIO.
 */
@Service
@RequiredArgsConstructor
public class DocumentServiceImpl implements DocumentService {

    private final ActorRepository actorRepository;
    private final ActorDocumentRepository documentRepository;
    private final StorageService storageService;

    @Override
    @Transactional
    public DocumentResponse upload(UUID actorId, MultipartFile file) throws Exception {
        var actor = actorRepository.findById(actorId)
                .orElseThrow(() -> new ActorNotFoundException(actorId));

        String extension = getExtension(file.getOriginalFilename());
        String filename = "documents/" + actorId + "/" + UUID.randomUUID() + "." + extension;
        String url = storageService.upload(file, filename);

        var document = ActorDocument.builder()
                .actor(actor)
                .name(file.getOriginalFilename())
                .originalName(file.getOriginalFilename())
                .type(file.getContentType())
                .url(url)
                .size(file.getSize())
                .build();

        return toResponse(documentRepository.save(document));
    }

    @Override
    @Transactional(readOnly = true)
    public List<DocumentResponse> findByActorId(UUID actorId) {
        return documentRepository.findByActorIdOrderByCreatedAtDesc(actorId)
                .stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional
    public void delete(UUID actorId, UUID documentId) throws Exception {
        var doc = documentRepository.findByIdAndActorId(documentId, actorId)
                .orElseThrow(() -> new RuntimeException("Document not found"));
        storageService.delete(doc.getUrl());
        documentRepository.delete(doc);
    }

    private String getExtension(String filename) {
        if (filename == null || !filename.contains(".")) return "bin";
        return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
    }

    private DocumentResponse toResponse(ActorDocument d) {
        return DocumentResponse.builder()
                .id(d.getId())
                .name(d.getName())
                .originalName(d.getOriginalName())
                .type(d.getType())
                .url(d.getUrl())
                .size(d.getSize())
                .createdAt(d.getCreatedAt())
                .build();
    }
}