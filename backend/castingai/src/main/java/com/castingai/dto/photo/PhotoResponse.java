package com.castingai.dto.photo;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class PhotoResponse {
    private UUID id;
    private String url;
    private String thumbnailUrl;
    private String originalName;
    private Long size;
    private boolean isMain;
    private LocalDateTime createdAt;
}