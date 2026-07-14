package com.castingai.ai.dto;

import lombok.Data;

/**
 * Structured criteria extracted from natural language query by AI.
 */
@Data
public class ParsedCriteria {
    private String gender;
    private Integer minAge;
    private Integer maxAge;
    private String city;
    private String country;
    private String language;
    private String skill;
    private String eyeColor;
    private String hairColor;
    private Integer minHeight;
    private Integer maxHeight;
}