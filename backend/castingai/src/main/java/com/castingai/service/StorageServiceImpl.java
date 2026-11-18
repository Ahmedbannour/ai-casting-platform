package com.castingai.storage;

import com.castingai.config.MinioConfig;
import io.minio.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

/**
 * MinIO implementation of StorageService.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StorageServiceImpl implements StorageService {

    private final MinioClient minioClient;
    private final MinioConfig minioConfig;

    @Override
    public String upload(MultipartFile file, String filename) throws Exception {
        ensureBucketExists();

        try (InputStream inputStream = file.getInputStream()) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(minioConfig.getBucketName())
                    .object(filename)
                    .stream(inputStream, file.getSize(), -1)
                    .contentType(file.getContentType())
                    .build());
        }

        return buildUrl(filename);
    }

    @Override
    public String uploadBytes(byte[] data, String filename, String contentType) throws Exception {
        ensureBucketExists();

        try (InputStream inputStream = new ByteArrayInputStream(data)) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(minioConfig.getBucketName())
                    .object(filename)
                    .stream(inputStream, data.length, -1)
                    .contentType(contentType)
                    .build());
        }

        return buildUrl(filename);
    }

    @Override
    public void delete(String filename) throws Exception {
        minioClient.removeObject(RemoveObjectArgs.builder()
                .bucket(minioConfig.getBucketName())
                .object(filename)
                .build());
    }

    /**
     * Creates the bucket if it does not exist yet.
     */
    private void ensureBucketExists() throws Exception {
        boolean exists = minioClient.bucketExists(
                BucketExistsArgs.builder().bucket(minioConfig.getBucketName()).build()
        );
        if (!exists) {
            minioClient.makeBucket(
                    MakeBucketArgs.builder().bucket(minioConfig.getBucketName()).build()
            );
            // T-109 : le stockage reste privé ; les fichiers sont servis par des liens signés (/api/media).
        }
    }

    /** T-109 · Au démarrage : retire l'accès public éventuel du stockage (anciennes installations). */
    @jakarta.annotation.PostConstruct
    void makePrivate() {
        try {
            if (minioClient.bucketExists(BucketExistsArgs.builder().bucket(minioConfig.getBucketName()).build()))
                minioClient.deleteBucketPolicy(DeleteBucketPolicyArgs.builder().bucket(minioConfig.getBucketName()).build());
        } catch (Exception e) {
            log.warn("Stockage injoignable au démarrage : accès public non vérifié ({})", e.getMessage());
        }
    }

    @Override
    public byte[] download(String key) throws Exception {
        try (InputStream in = minioClient.getObject(GetObjectArgs.builder().bucket(minioConfig.getBucketName()).object(key).build())) {
            return in.readAllBytes();
        }
    }

    private String buildUrl(String filename) {
        return minioConfig.getPublicBase() + "/" + minioConfig.getBucketName() + "/" + filename;
    }

    @Override
    public String keyFromUrl(String url) {
        if (url == null) return null;
        // Adresse publique actuelle, ou ancienne adresse directe de MinIO.
        for (String base : new String[] { minioConfig.getPublicBase(), minioConfig.getUrl() }) {
            String prefix = base + "/" + minioConfig.getBucketName() + "/";
            if (url.startsWith(prefix)) return url.substring(prefix.length());
        }
        return null;
    }
}
