package com.castingai.dto.language;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class LanguageDto {
    @NotBlank(message = "Language name is required")
    private String name;
    private String level;
}