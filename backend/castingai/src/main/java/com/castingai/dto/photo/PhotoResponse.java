package com.castingai.dto.photo;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class PhotoResponse {
    private UUID id;
    @tools.jackson.databind.annotation.JsonSerialize(using = com.castingai.storage.MediaUrls.Signed.class) private String url;
    @tools.jackson.databind.annotation.JsonSerialize(using = com.castingai.storage.MediaUrls.Signed.class) private String thumbnailUrl;
    private String originalName;
    private Long size;
    private boolean isMain;
    private LocalDateTime createdAt;
}