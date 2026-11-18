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
    @tools.jackson.databind.annotation.JsonSerialize(using = com.castingai.storage.MediaUrls.Signed.class) private String mainPhotoUrl;
    @tools.jackson.databind.annotation.JsonSerialize(contentUsing = com.castingai.storage.MediaUrls.Signed.class) private List<String> photoUrls;
    private List<String> skills;
    private List<String> languages;
    private double score;
    private String reason;
}