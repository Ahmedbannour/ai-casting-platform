package com.castingai.controller;

import com.castingai.dto.photo.PhotoResponse;
import com.castingai.dto.photo.PhotoUploadResponse;
import com.castingai.service.PhotoService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

/**
 * REST controller for actor photo management.
 */
@RestController
@RequestMapping("/api/actors/{actorId}/photos")
@RequiredArgsConstructor
public class PhotoController {

    private final PhotoService photoService;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<PhotoUploadResponse> upload(
            @PathVariable UUID actorId,
            @RequestParam("files") MultipartFile[] files) throws Exception {
        return ResponseEntity.ok(photoService.upload(actorId, files));
    }

    @GetMapping
    public ResponseEntity<List<PhotoResponse>> findAll(@PathVariable UUID actorId) {
        return ResponseEntity.ok(photoService.findByActorId(actorId));
    }

    @DeleteMapping("/{photoId}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID actorId,
            @PathVariable UUID photoId) throws Exception {
        photoService.delete(actorId, photoId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{photoId}/main")
    public ResponseEntity<PhotoResponse> setMain(
            @PathVariable UUID actorId,
            @PathVariable UUID photoId) {
        return ResponseEntity.ok(photoService.setMainPhoto(actorId, photoId));
    }
}