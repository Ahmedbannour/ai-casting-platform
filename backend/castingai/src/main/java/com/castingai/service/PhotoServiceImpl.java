package com.castingai.service;

import com.castingai.dto.photo.PhotoResponse;
import com.castingai.dto.photo.PhotoUploadResponse;
import com.castingai.entity.Actor;
import com.castingai.entity.ActorPhoto;
import com.castingai.exception.ActorNotFoundException;
import com.castingai.repository.ActorPhotoRepository;
import com.castingai.repository.ActorRepository;
import com.castingai.storage.StorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.coobird.thumbnailator.Thumbnails;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Implementation of PhotoService — handles upload, compression, thumbnail, and MinIO storage.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PhotoServiceImpl implements PhotoService {

    private static final int MAX_WIDTH       = 1200;
    private static final int MAX_HEIGHT      = 1200;
    private static final int THUMB_WIDTH     = 300;
    private static final int THUMB_HEIGHT    = 300;
    private static final float QUALITY       = 0.85f;

    private final ActorRepository actorRepository;
    private final ActorPhotoRepository photoRepository;
    private final StorageService storageService;

    @Override
    @Transactional
    public PhotoUploadResponse upload(UUID actorId, MultipartFile[] files) throws Exception {
        Actor actor = actorRepository.findById(actorId)
                .orElseThrow(() -> new ActorNotFoundException(actorId));

        boolean hasMain = photoRepository.countByActorId(actorId) == 0;
        List<PhotoResponse> responses = new ArrayList<>();

        for (MultipartFile file : files) {
            String extension = getExtension(file.getOriginalFilename());
            String filename  = "actors/" + actorId + "/" + UUID.randomUUID() + "." + extension;
            String thumbName = "actors/" + actorId + "/thumb_" + UUID.randomUUID() + "." + extension;

            // Compress and upload main image
            byte[] compressed = compress(file, MAX_WIDTH, MAX_HEIGHT);
            String url = storageService.uploadBytes(compressed, filename, file.getContentType());

            // Generate and upload thumbnail
            byte[] thumbnail = compress(file, THUMB_WIDTH, THUMB_HEIGHT);
            String thumbUrl  = storageService.uploadBytes(thumbnail, thumbName, file.getContentType());

            ActorPhoto photo = ActorPhoto.builder()
                    .actor(actor)
                    .filename(filename)
                    .originalName(file.getOriginalFilename())
                    .url(url)
                    .thumbnailUrl(thumbUrl)
                    .size((long) compressed.length)
                    .isMain(hasMain)
                    .build();

            photoRepository.save(photo);
            responses.add(toResponse(photo));
            hasMain = false;
        }

        return PhotoUploadResponse.builder()
                .uploaded(responses.size())
                .photos(responses)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<PhotoResponse> findByActorId(UUID actorId) {
        return photoRepository
                .findByActorIdOrderByIsMainDescCreatedAtDesc(actorId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Override
    @Transactional
    public void delete(UUID actorId, UUID photoId) throws Exception {
        ActorPhoto photo = photoRepository.findByIdAndActorId(photoId, actorId)
                .orElseThrow(() -> new RuntimeException("Photo not found"));

        storageService.delete(photo.getFilename());
        if (photo.getThumbnailUrl() != null) {
            storageService.delete("actors/" + actorId + "/thumb_" +
                    photo.getFilename().substring(photo.getFilename().lastIndexOf('/') + 1));
        }

        photoRepository.delete(photo);
    }

    @Override
    @Transactional
    public PhotoResponse setMainPhoto(UUID actorId, UUID photoId) {
        photoRepository.clearMainPhoto(actorId);

        ActorPhoto photo = photoRepository.findByIdAndActorId(photoId, actorId)
                .orElseThrow(() -> new RuntimeException("Photo not found"));

        photo.setMain(true);
        return toResponse(photoRepository.save(photo));
    }

    /**
     * Compresses an image to the given dimensions using Thumbnailator.
     */
    private byte[] compress(MultipartFile file, int width, int height) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Thumbnails.of(file.getInputStream())
                .size(width, height)
                .outputQuality(QUALITY)
                .keepAspectRatio(true)
                .toOutputStream(out);
        return out.toByteArray();
    }

    private String getExtension(String filename) {
        if (filename == null || !filename.contains(".")) return "jpg";
        return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
    }

    private PhotoResponse toResponse(ActorPhoto photo) {
        return PhotoResponse.builder()
                .id(photo.getId())
                .url(photo.getUrl())
                .thumbnailUrl(photo.getThumbnailUrl())
                .originalName(photo.getOriginalName())
                .size(photo.getSize())
                .isMain(photo.isMain())
                .createdAt(photo.getCreatedAt())
                .build();
    }
}