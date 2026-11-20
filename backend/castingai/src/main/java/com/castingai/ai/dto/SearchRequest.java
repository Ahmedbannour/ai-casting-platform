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

    /** T-165 · Rôle pour lequel on cherche : un rôle de figuration ne propose que les acteurs qui l'acceptent. */
    private java.util.UUID roleId;

    private int page = 0;
    private int size = 10;
}