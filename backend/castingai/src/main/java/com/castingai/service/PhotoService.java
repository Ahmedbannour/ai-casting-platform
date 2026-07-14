package com.castingai.service;

import com.castingai.dto.photo.PhotoResponse;
import com.castingai.dto.photo.PhotoUploadResponse;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

/**
 * Photo management service interface.
 */
public interface PhotoService {

    PhotoUploadResponse upload(UUID actorId, MultipartFile[] files) throws Exception;

    List<PhotoResponse> findByActorId(UUID actorId);

    void delete(UUID actorId, UUID photoId) throws Exception;

    PhotoResponse setMainPhoto(UUID actorId, UUID photoId);
}