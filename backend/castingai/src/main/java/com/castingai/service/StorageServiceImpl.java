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
            // Make bucket public
            String policy = """
                {
                  "Version": "2012-10-17",
                  "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"AWS": ["*"]},
                    "Action": ["s3:GetObject"],
                    "Resource": ["arn:aws:s3:::%s/*"]
                  }]
                }
                """.formatted(minioConfig.getBucketName());

            minioClient.setBucketPolicy(SetBucketPolicyArgs.builder()
                    .bucket(minioConfig.getBucketName())
                    .config(policy)
                    .build());
        }
    }

    private String buildUrl(String filename) {
        return minioConfig.getUrl() + "/" + minioConfig.getBucketName() + "/" + filename;
    }
}