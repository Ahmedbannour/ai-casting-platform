package com.castingai.dto.skill;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SkillDto {
    @NotBlank(message = "Skill name is required")
    private String name;
    private String level;
}