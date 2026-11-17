package com.castingai.dto.actor;

import com.castingai.dto.availability.AvailabilityDto;
import com.castingai.dto.experience.ExperienceDto;
import com.castingai.dto.language.LanguageDto;
import com.castingai.dto.photo.PhotoResponse;
import com.castingai.dto.skill.SkillDto;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class ActorDetailResponse {
    private UUID id;
    private String firstName;
    private String lastName;
    private LocalDate birthDate;
    private Integer age;
    private String gender;
    private String city;
    private String country;
    private String phone;
    private String email;
    /** T-094 : coordonnées masquées tant que l'agent ne les demande pas. */
    private boolean contactHidden;
    private String bio;
    private Integer height;
    private Integer weight;
    private String eyeColor;
    private String hairColor;
    private String mainPhotoUrl;
    private List<PhotoResponse> photos;
    private List<SkillDto> skills;
    private List<LanguageDto> languages;
    private List<ExperienceDto> experiences;
    private List<AvailabilityDto> availabilities;
    private List<CommentDto> comments;
    private List<DocumentResponse> documents;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}