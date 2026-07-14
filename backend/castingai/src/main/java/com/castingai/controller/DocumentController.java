package com.castingai.controller;

import com.castingai.dto.actor.DocumentResponse;
import com.castingai.service.DocumentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

/**
 * REST controller for actor document management.
 */
@RestController
@RequestMapping("/api/actors/{actorId}/documents")
@RequiredArgsConstructor
public class DocumentController {

    private final DocumentService documentService;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DocumentResponse> upload(
            @PathVariable UUID actorId,
            @RequestParam("file") MultipartFile file) throws Exception {
        return ResponseEntity.ok(documentService.upload(actorId, file));
    }

    @GetMapping
    public ResponseEntity<List<DocumentResponse>> findAll(@PathVariable UUID actorId) {
        return ResponseEntity.ok(documentService.findByActorId(actorId));
    }

    @DeleteMapping("/{documentId}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID actorId,
            @PathVariable UUID documentId) throws Exception {
        documentService.delete(actorId, documentId);
        return ResponseEntity.noContent().build();
    }
}