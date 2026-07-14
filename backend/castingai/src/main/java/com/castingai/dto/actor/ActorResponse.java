package com.castingai.dto.actor;

import com.castingai.dto.availability.AvailabilityDto;
import com.castingai.dto.experience.ExperienceDto;
import com.castingai.dto.language.LanguageDto;
import com.castingai.dto.skill.SkillDto;
import lombok.Builder;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class ActorResponse {
    private UUID id;
    private String firstName;
    private String lastName;
    private LocalDate birthDate;
    private String gender;
    private String city;
    private String country;
    private String phone;
    private String email;
    private String bio;
    private Integer height;
    private Integer weight;
    private String eyeColor;
    private String hairColor;
    private List<SkillDto> skills;
    private List<LanguageDto> languages;
    private List<ExperienceDto> experiences;
    private List<AvailabilityDto> availabilities;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}