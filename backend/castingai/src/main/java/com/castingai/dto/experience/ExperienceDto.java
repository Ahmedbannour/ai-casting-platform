package com.castingai.dto.experience;


import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ExperienceDto {
    @NotBlank(message = "Title is required")
    private String title;
    private String production;
    private String role;
    private Integer year;
    private String description;
}