package com.castingai.config;

import io.minio.MinioClient;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * MinIO client configuration mapped from application.yml.
 */
@Configuration
@ConfigurationProperties(prefix = "minio")
@Getter
@Setter
public class MinioConfig {

    private String url;
    private String accessKey;
    private String secretKey;
    private String bucketName;
    /**
     * Début des adresses de fichiers données au navigateur. Vide = adresse relative (/casting-media/...),
     * servie par la même origine que l'application (proxy en développement, serveur web en production).
     */
    private String publicBase = "";

    @Bean
    public MinioClient minioClient() {
        return MinioClient.builder()
                .endpoint(url)
                .credentials(accessKey, secretKey)
                .build();
    }
}