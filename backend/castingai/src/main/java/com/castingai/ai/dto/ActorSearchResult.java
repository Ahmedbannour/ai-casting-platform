package com.castingai.ai.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.UUID;

/**
 * Single actor result returned by the AI search.
 */
@Data
@Builder
public class ActorSearchResult {
    private UUID id;
    private String firstName;
    private String lastName;
    private String city;
    private String country;
    private String gender;
    private Integer age;
    private String mainPhotoUrl;
    private List<String> skills;
    private List<String> languages;
    private double score;
    private String reason;
}