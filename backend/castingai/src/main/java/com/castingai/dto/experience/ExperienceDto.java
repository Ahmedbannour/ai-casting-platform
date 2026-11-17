package com.castingai.dto.experience;


import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ExperienceDto {
    @NotBlank(message = "Le type de rôle d'une expérience est obligatoire")
    @Size(max = 120, message = "Type de rôle : 120 caractères au plus")
    private String title;
    @Size(max = 160) private String production;
    @Size(max = 120) private String role;
    @Min(value = 1900, message = "Année d'expérience : 1900 au plus tôt")
    @Max(value = 2100, message = "Année d'expérience invalide")
    private Integer year;
    @Size(max = 1000, message = "Description : 1000 caractères au plus")
    private String description;
}