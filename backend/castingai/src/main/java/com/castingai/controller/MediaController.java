package com.castingai.controller;

import com.castingai.config.MinioConfig;
import com.castingai.storage.MediaUrls;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.InputStream;
import java.time.Duration;

/**
 * T-109 · Sert une photo ou un document du stockage privé, seulement avec une signature valable.
 * Sans signature, signature fausse ou lien expiré : 403, sans indiquer si le fichier existe.
 */
@RestController
@RequiredArgsConstructor
public class MediaController {

    private final MediaUrls media;
    private final MinioClient minio;
    private final MinioConfig config;

    @GetMapping("/api/media/{*key}")
    public ResponseEntity<byte[]> get(@PathVariable String key, @RequestParam(name = "e", defaultValue = "0") long exp,
                                      @RequestParam(name = "s", required = false) String sig) {
        String objectKey = key.startsWith("/") ? key.substring(1) : key;
        if (objectKey.isEmpty() || objectKey.contains("..") || !media.valid(objectKey, exp, sig))
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        try {
            StatObjectResponse st = minio.statObject(StatObjectArgs.builder().bucket(config.getBucketName()).object(objectKey).build());
            byte[] body;
            try (InputStream in = minio.getObject(GetObjectArgs.builder().bucket(config.getBucketName()).object(objectKey).build())) {
                body = in.readAllBytes();
            }
            MediaType type;
            try { type = MediaType.parseMediaType(st.contentType()); } catch (Exception e) { type = MediaType.APPLICATION_OCTET_STREAM; }
            return ResponseEntity.ok()
                    .contentType(type)
                    .cacheControl(CacheControl.maxAge(Duration.ofSeconds(MediaUrls.WINDOW)).cachePrivate())
                    .header("X-Content-Type-Options", "nosniff")
                    .body(body);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
    }
}
