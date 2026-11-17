package com.castingai.dto.skill;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SkillDto {
    @NotBlank(message = "Le nom de la compétence est obligatoire")
    private String name;
    private String level;
}