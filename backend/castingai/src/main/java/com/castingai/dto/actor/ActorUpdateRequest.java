package com.castingai.dto.actor;

import com.castingai.dto.availability.AvailabilityDto;
import com.castingai.dto.experience.ExperienceDto;
import com.castingai.dto.language.LanguageDto;
import com.castingai.dto.skill.SkillDto;
import lombok.Data;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Data
public class ActorUpdateRequest {
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
    private List<SkillDto> skills = new ArrayList<>();
    private List<LanguageDto> languages = new ArrayList<>();
    private List<ExperienceDto> experiences = new ArrayList<>();
    private List<AvailabilityDto> availabilities = new ArrayList<>();
}