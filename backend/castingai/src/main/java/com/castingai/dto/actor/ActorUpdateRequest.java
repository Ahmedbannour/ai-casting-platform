package com.castingai.dto.actor;

import com.castingai.dto.availability.AvailabilityDto;
import com.castingai.dto.experience.ExperienceDto;
import com.castingai.dto.language.LanguageDto;
import com.castingai.dto.skill.SkillDto;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Data
public class ActorUpdateRequest {
    @Size(max = 80, message = "Prénom : 80 caractères au plus")
    @Pattern(regexp = "^[^\\d<>@#]*$", message = "Pas de chiffres ni de symboles dans le prénom")
    private String firstName;
    @Size(max = 80, message = "Nom : 80 caractères au plus")
    @Pattern(regexp = "^[^\\d<>@#]*$", message = "Pas de chiffres ni de symboles dans le nom")
    private String lastName;
    @Past(message = "La date de naissance doit être dans le passé")
    private LocalDate birthDate;
    @Size(max = 40, message = "Genre : 40 caractères au plus")
    private String gender;
    @Size(max = 80, message = "Ville : 80 caractères au plus")
    private String city;
    @Size(max = 80, message = "Pays : 80 caractères au plus")
    private String country;
    @Pattern(regexp = "^$|^\\+?[\\d\\s().-]{6,22}$", message = "Téléphone invalide : chiffres, espaces et « + » uniquement")
    private String phone;
    @Email(regexp = "^$|^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$", message = "Adresse e-mail invalide")
    @Size(max = 160, message = "E-mail : 160 caractères au plus")
    private String email;
    @Size(max = 2000, message = "Biographie : 2000 caractères au plus")
    private String bio;
    @Min(value = 40, message = "Taille : entre 40 et 250 cm") @Max(value = 250, message = "Taille : entre 40 et 250 cm")
    private Integer height;
    @Min(value = 3, message = "Poids : entre 3 et 300 kg") @Max(value = 300, message = "Poids : entre 3 et 300 kg")
    private Integer weight;
    @Size(max = 40) private String eyeColor;
    @Size(max = 40) private String hairColor;

    @Valid private List<SkillDto> skills = new ArrayList<>();
    @Valid private List<LanguageDto> languages = new ArrayList<>();
    @Valid private List<ExperienceDto> experiences = new ArrayList<>();
    @Valid private List<AvailabilityDto> availabilities = new ArrayList<>();

    /** Naissance plausible : pas avant 1920. */
    @JsonIgnore
    @AssertTrue(message = "Date de naissance trop ancienne : vérifiez l'année")
    public boolean isBirthDatePlausible() {
        return birthDate == null || !birthDate.isBefore(LocalDate.of(1920, 1, 1));
    }

    /** Aucune expérience datée d'avant la naissance. */
    @JsonIgnore
    @AssertTrue(message = "Une expérience est datée d'avant la naissance")
    public boolean isExperiencesAfterBirth() {
        if (birthDate == null || experiences == null) return true;
        return experiences.stream().allMatch(e -> e == null || e.getYear() == null || e.getYear() >= birthDate.getYear());
    }

    /** Deux périodes de disponibilité ne se chevauchent pas. */
    @JsonIgnore
    @AssertTrue(message = "Deux périodes de disponibilité se chevauchent")
    public boolean isAvailabilitiesDisjoint() {
        return AvailabilityDto.disjoint(availabilities);
    }
}
