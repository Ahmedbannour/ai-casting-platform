package com.castingai.dto.actor;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class DocumentResponse {
    private UUID id;
    private String name;
    private String originalName;
    private String type;
    private String url;
    private Long size;
    private LocalDateTime createdAt;
}