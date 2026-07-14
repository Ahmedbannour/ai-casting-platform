package com.castingai.dto.actor;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class CommentDto {
    private UUID id;
    private String content;
    private String authorName;
    private LocalDateTime createdAt;
}