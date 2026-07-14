package com.castingai.ai.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Natural language search request from the user.
 */
@Data
public class SearchRequest {

    @NotBlank(message = "Query is required")
    private String query;

    private int page = 0;
    private int size = 10;
}