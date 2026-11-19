package com.castingai.service;

import com.castingai.entity.Agency;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.ConflictException;
import com.castingai.repository.AgencyRepository;
import com.castingai.repository.UserRepository;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;

/**
 * T-157 · Cahier v2 : une marque, une agence marketing, un réalisateur ou une boîte de production crée
 * son compte et son organisation. Le compte reste fermé jusqu'à la validation de l'administrateur.
 */
@Service
@RequiredArgsConstructor
public class ProRegistrationService {

    public record Request(
            @NotNull(message = "Choisissez votre métier") Role role,
            @NotBlank(message = "Le prénom est obligatoire") @Size(max = 80) String firstName,
            @NotBlank(message = "Le nom est obligatoire") @Size(max = 80) String lastName,
            @NotBlank(message = "L'adresse e-mail est obligatoire") @Email(message = "Adresse e-mail invalide") String email,
            @NotBlank(message = "Le mot de passe est obligatoire") @Size(min = 8, max = 100, message = "Mot de passe : 8 caractères au moins") String password,
            @Size(max = 160, message = "Nom : 160 caractères au plus") String organisation,
            @Size(max = 100) String city,
            Boolean acceptTerms) {}

    public record Result(String status, String message) {}

    private static final Map<Role, String> KIND = Map.of(
            Role.MARQUE, "MARQUE", Role.AGENCE_MARKETING, "AGENCE_MARKETING",
            Role.BOITE_PROD, "BOITE_PROD", Role.REALISATEUR, "BOITE_PROD");

    private final UserRepository users;
    private final AgencyRepository agencies;
    private final PasswordEncoder encoder;
    private final ConsentService consents;
    private final AuditService audit;

    @Transactional
    public Result register(Request r) {
        if (!KIND.containsKey(r.role())) throw new IllegalArgumentException("Ce métier ne s'inscrit pas ici");
        var consent = new ConsentService.Request(r.acceptTerms(), "MAJEUR", null);
        ConsentService.validate(consent);
        String email = r.email().trim().toLowerCase(Locale.ROOT);
        if (users.existsByEmail(email)) throw new ConflictException("Un compte existe déjà avec cette adresse e-mail");
        String orgName = r.organisation() == null ? "" : r.organisation().trim();
        if (orgName.isEmpty() && r.role() != Role.REALISATEUR) {
            throw new IllegalArgumentException("Indiquez le nom de votre organisation");
        }
        Agency org = null;
        if (!orgName.isEmpty()) {
            org = new Agency();
            org.setName(orgName);
            org.setCity(r.city() == null || r.city().isBlank() ? null : r.city().trim());
            org.setContactEmail(email);
            org.setContractStart(LocalDate.now());
            org.setKind(KIND.get(r.role()));
            org.setCurrency("TND");
            org.setNotes("Inscription en ligne, à valider");
            org = agencies.save(org);
        }
        User u = User.builder()
                .email(email).firstName(r.firstName().trim()).lastName(r.lastName().trim())
                .password(encoder.encode(r.password())).role(r.role())
                .enabled(false).pendingApproval(true).agency(org).build();
        users.saveAndFlush(u);
        consents.record(u.getId(), consent, "INSCRIPTION");
        audit.log("INSCRIPTION_PRO", email, r.role().name() + (org == null ? " · indépendant" : " · " + org.getName()));
        return new Result("EN_ATTENTE", "Votre demande est envoyée. L'équipe AI Casting valide votre compte, puis vous pourrez vous connecter.");
    }
}
