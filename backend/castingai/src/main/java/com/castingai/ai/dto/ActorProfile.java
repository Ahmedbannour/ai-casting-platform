package com.castingai.ai.dto;

import lombok.Builder;
import lombok.Data;
import java.util.List;

@Data
@Builder
public class ActorProfile {
    private String id;
    private String firstName;
    private String lastName;
    private Integer age;
    private String gender;
    private String city;
    private String country;
    private String bio;
    private Integer height;
    private String eyeColor;
    private String hairColor;
    private List<String> languages;
    private List<String> skills;
    private List<String> experiences;
}