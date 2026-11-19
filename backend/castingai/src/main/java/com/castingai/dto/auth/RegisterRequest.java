package com.castingai.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class RegisterRequest {

    @Email(message = "Adresse e-mail invalide")
    @NotBlank(message = "L'adresse e-mail est obligatoire")
    private String email;

    @NotBlank(message = "Le mot de passe est obligatoire")
    @Size(min = 8, max = 100, message = "Mot de passe : 8 caractères au moins")
    private String password;

    @NotBlank(message = "Le prénom est obligatoire")
    @Size(max = 80)
    private String firstName;

    @NotBlank(message = "Le nom est obligatoire")
    @Size(max = 80)
    private String lastName;

    /** T-101 · Case « J'accepte les conditions… », jamais pré-cochée. */
    private Boolean acceptTerms;

    /** MAJEUR, ou MINEUR avec le nom du représentant légal. */
    private String age;

    @Size(max = 120)
    private String guardianName;

    /** Cahier v2 (EX-52) · Figuration acceptée : EXTRA, SILHOUETTE, FIGURANT_SPECIAL ; liste vide = refuse. */
    private java.util.List<String> figuration;
}