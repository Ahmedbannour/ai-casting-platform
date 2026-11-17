package com.castingai.dto.language;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class LanguageDto {
    @NotBlank(message = "Le nom de la langue est obligatoire")
    private String name;
    private String level;
}