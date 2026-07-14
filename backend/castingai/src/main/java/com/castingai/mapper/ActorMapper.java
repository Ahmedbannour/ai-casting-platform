package com.castingai.mapper;

import com.castingai.dto.actor.*;
import com.castingai.dto.availability.AvailabilityDto;
import com.castingai.dto.experience.ExperienceDto;
import com.castingai.dto.language.LanguageDto;
import com.castingai.dto.skill.SkillDto;
import com.castingai.entity.*;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Maps between Actor entity and DTOs.
 */
@Component
public class ActorMapper {

    public Actor toEntity(ActorCreateRequest request) {
        Actor actor = Actor.builder()
                .firstName(request.getFirstName())
                .lastName(request.getLastName())
                .birthDate(request.getBirthDate())
                .gender(request.getGender())
                .city(request.getCity())
                .country(request.getCountry())
                .phone(request.getPhone())
                .email(request.getEmail())
                .bio(request.getBio())
                .height(request.getHeight())
                .weight(request.getWeight())
                .eyeColor(request.getEyeColor())
                .hairColor(request.getHairColor())
                .build();

        if (request.getSkills() != null) {
            request.getSkills().forEach(dto -> {
                ActorSkill skill = ActorSkill.builder()
                        .name(dto.getName())
                        .level(dto.getLevel())
                        .actor(actor)
                        .build();
                actor.getSkills().add(skill);
            });
        }

        if (request.getLanguages() != null) {
            request.getLanguages().forEach(dto -> {
                ActorLanguage lang = ActorLanguage.builder()
                        .name(dto.getName())
                        .level(dto.getLevel())
                        .actor(actor)
                        .build();
                actor.getLanguages().add(lang);
            });
        }

        if (request.getExperiences() != null) {
            request.getExperiences().forEach(dto -> {
                ActorExperience exp = ActorExperience.builder()
                        .title(dto.getTitle())
                        .production(dto.getProduction())
                        .role(dto.getRole())
                        .year(dto.getYear())
                        .description(dto.getDescription())
                        .actor(actor)
                        .build();
                actor.getExperiences().add(exp);
            });
        }

        if (request.getAvailabilities() != null) {
            request.getAvailabilities().forEach(dto -> {
                ActorAvailability avail = ActorAvailability.builder()
                        .fromDate(dto.getFromDate())
                        .toDate(dto.getToDate())
                        .note(dto.getNote())
                        .actor(actor)
                        .build();
                actor.getAvailabilities().add(avail);
            });
        }

        return actor;
    }

    public ActorResponse toResponse(Actor actor) {
        return ActorResponse.builder()
                .id(actor.getId())
                .firstName(actor.getFirstName())
                .lastName(actor.getLastName())
                .birthDate(actor.getBirthDate())
                .gender(actor.getGender())
                .city(actor.getCity())
                .country(actor.getCountry())
                .phone(actor.getPhone())
                .email(actor.getEmail())
                .bio(actor.getBio())
                .height(actor.getHeight())
                .weight(actor.getWeight())
                .eyeColor(actor.getEyeColor())
                .hairColor(actor.getHairColor())
                .skills(actor.getSkills() != null ? mapSkills(actor.getSkills()) : List.of())
                .languages(actor.getLanguages() != null ? mapLanguages(actor.getLanguages()) : List.of())
                .experiences(actor.getExperiences() != null ? mapExperiences(actor.getExperiences()) : List.of())
                .availabilities(actor.getAvailabilities() != null ? mapAvailabilities(actor.getAvailabilities()) : List.of())
                .createdAt(actor.getCreatedAt())
                .updatedAt(actor.getUpdatedAt())
                .build();
    }

    public ActorSummaryResponse toSummary(Actor actor) {
        return ActorSummaryResponse.builder()
                .id(actor.getId())
                .firstName(actor.getFirstName())
                .lastName(actor.getLastName())
                .city(actor.getCity())
                .country(actor.getCountry())
                .gender(actor.getGender())
                .height(actor.getHeight())
                .eyeColor(actor.getEyeColor())
                .hairColor(actor.getHairColor())
                .build();
    }

    private List<SkillDto> mapSkills(List<ActorSkill> skills) {
        return skills.stream().map(s -> {
            SkillDto dto = new SkillDto();
            dto.setName(s.getName());
            dto.setLevel(s.getLevel());
            return dto;
        }).toList();
    }

    private List<LanguageDto> mapLanguages(List<ActorLanguage> languages) {
        return languages.stream().map(l -> {
            LanguageDto dto = new LanguageDto();
            dto.setName(l.getName());
            dto.setLevel(l.getLevel());
            return dto;
        }).toList();
    }

    private List<ExperienceDto> mapExperiences(List<ActorExperience> experiences) {
        return experiences.stream().map(e -> {
            ExperienceDto dto = new ExperienceDto();
            dto.setTitle(e.getTitle());
            dto.setProduction(e.getProduction());
            dto.setRole(e.getRole());
            dto.setYear(e.getYear());
            dto.setDescription(e.getDescription());
            return dto;
        }).toList();
    }

    private List<AvailabilityDto> mapAvailabilities(List<ActorAvailability> availabilities) {
        return availabilities.stream().map(a -> {
            AvailabilityDto dto = new AvailabilityDto();
            dto.setFromDate(a.getFromDate());
            dto.setToDate(a.getToDate());
            dto.setNote(a.getNote());
            return dto;
        }).toList();
    }
}