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
}