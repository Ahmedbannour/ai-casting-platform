package com.castingai.controller;

import com.castingai.dto.actor.ActorCreateRequest;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.ConflictException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.ActorRepository;
import com.castingai.repository.UserRepository;
import com.castingai.service.ActorImportService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;

/** Administration de l'agence : comptes des agents, vue d'ensemble, import d'acteurs. (Rôle ADMIN, cf. SecurityConfig.) */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final UserRepository users;
    private final com.castingai.service.AuditService audit;
    private final ActorRepository actors;
    private final com.castingai.service.AdminHomeService adminHome;
    private final PasswordEncoder passwordEncoder;
    private final ActorImportService importService;
    private final com.castingai.repository.AgencyRepository agencyRepository;

    /**
     * Organisation d'un compte (cahier v2) : obligatoire pour une marque, une agence marketing ou une boîte de
     * production, facultative pour un réalisateur (indépendant ou rattaché à une boîte), du bon type, et dans la
     * limite de membres prévue par son contrat.
     */
    private com.castingai.entity.Agency agencyFor(Role role, UUID agencyId, UUID exceptUser) {
        String kind = switch (role) {
            case MARQUE -> "MARQUE";
            case AGENCE_MARKETING -> "AGENCE_MARKETING";
            case BOITE_PROD, REALISATEUR -> "BOITE_PROD";
            default -> null;
        };
        if (kind == null) return null;
        if (agencyId == null) {
            if (role == Role.REALISATEUR) return null;
            throw new IllegalArgumentException("Choisissez l'organisation de ce compte");
        }
        com.castingai.entity.Agency a = agencyRepository.findById(agencyId)
                .orElseThrow(() -> new ResourceNotFoundException("Organisation introuvable"));
        if (!kind.equals(a.getKind())) {
            throw new IllegalArgumentException(a.getName() + " n'est pas une organisation du bon type pour ce rôle");
        }
        if (a.getMaxAgents() != null) {
            long n = users.findAll().stream()
                    .filter(u -> u.getAgency() != null && u.getAgency().getId().equals(agencyId) && !u.getId().equals(exceptUser))
                    .count();
            if (n >= a.getMaxAgents()) {
                throw new ConflictException("Le contrat de " + a.getName() + " prévoit " + a.getMaxAgents() + " agent(s) au plus");
            }
        }
        return a;
    }

    public record UserRow(UUID id, String email, String firstName, String lastName, String role, boolean enabled,
                          String provider, LocalDateTime createdAt, UUID agencyId, String agencyName, boolean emailVerified) {}
    public record CreateAgentRequest(
            @NotBlank(message = "L'adresse e-mail est obligatoire") @Email(message = "Adresse e-mail invalide") String email,
            @NotBlank(message = "Le prénom est obligatoire") @Size(max = 80) String firstName,
            @NotBlank(message = "Le nom est obligatoire") @Size(max = 80) String lastName,
            @Size(min = 8, max = 100, message = "Mot de passe : 8 caractères au moins") String password,
            Role role,
            /** Agence cliente de l'agent (obligatoire pour un agent). */
            UUID agencyId) {}
    public record CreatedAgent(UserRow user, String temporaryPassword) {}
    public record UpdateUserRequest(Boolean enabled, Role role, UUID agencyId) {}
    public record Overview(long agents, long admins, long actorAccounts, long actors,
                           long actorsAgence, long actorsInscription, long actorsImport) {}
    public record ImportRequest(@NotNull @Valid List<ActorCreateRequest> rows) {}

    static String roleLabel(Role r) {
        return switch (r) {
            case ADMIN -> "Administrateur";
            case BOITE_PROD -> "Boîte de production";
            case ACTEUR -> "Acteur";
            case MARQUE -> "Marque";
            case AGENCE_MARKETING -> "Agence marketing";
            case REALISATEUR -> "Réalisateur";
        };
    }

    /** T-144 · Accueil de l'administrateur. */
    @GetMapping("/home")
    public com.castingai.service.AdminHomeService.Home home() { return adminHome.home(); }

    @GetMapping("/overview")
    public Overview overview() {
        Map<Role, Long> byRole = new EnumMap<>(Role.class);
        users.findAll().forEach(u -> byRole.merge(u.getRole(), 1L, Long::sum));
        Map<String, Long> bySource = new HashMap<>();
        for (Object[] r : actors.countBySource()) bySource.put((String) r[0], (Long) r[1]);
        return new Overview(byRole.getOrDefault(Role.BOITE_PROD, 0L), byRole.getOrDefault(Role.ADMIN, 0L),
                byRole.getOrDefault(Role.ACTEUR, 0L), actors.count(),
                bySource.getOrDefault("AGENCE", 0L), bySource.getOrDefault("INSCRIPTION", 0L), bySource.getOrDefault("IMPORT", 0L));
    }

    @GetMapping("/users")
    @Transactional(readOnly = true)
    public List<UserRow> list(@RequestParam(required = false) Role role, @RequestParam(required = false) String q) {
        String needle = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        return users.findAll().stream()
                .filter(u -> role == null || u.getRole() == role)
                .filter(u -> needle.isEmpty() || (u.getEmail() + " " + u.getFirstName() + " " + u.getLastName()).toLowerCase(Locale.ROOT).contains(needle))
                .sorted(Comparator.comparing(User::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(AdminController::row)
                .toList();
    }

    /** Ajoute un agent (ou un administrateur). Sans mot de passe fourni, un mot de passe provisoire est généré et renvoyé une seule fois. */
    @PostMapping("/agents")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public CreatedAgent createAgent(@Valid @RequestBody CreateAgentRequest req) {
        String email = req.email().trim().toLowerCase(Locale.ROOT);
        if (users.existsByEmail(email)) throw new ConflictException("Un compte existe déjà avec cette adresse e-mail");
        Role role = req.role() == null ? Role.BOITE_PROD : req.role();
        if (role == Role.ACTEUR) throw new IllegalArgumentException("Les comptes acteur sont créés par l'inscription ou par l'import");
        com.castingai.entity.Agency agency = agencyFor(role, req.agencyId(), null);
        String temp = req.password() == null || req.password().isBlank() ? temporaryPassword() : null;
        User u = User.builder()
                .email(email).firstName(req.firstName().trim()).lastName(req.lastName().trim())
                .password(passwordEncoder.encode(temp != null ? temp : req.password()))
                .role(role).enabled(true).agency(agency).build();
        User saved = users.save(u);
        audit.log("COMPTE_CREE", email, roleLabel(role) + (agency == null ? "" : " · " + agency.getName()));
        return new CreatedAgent(row(saved), temp);
    }

    @PatchMapping("/users/{id}")
    @Transactional
    public UserRow update(@PathVariable UUID id, @RequestBody UpdateUserRequest req, @AuthenticationPrincipal UserDetails me) {
        User u = users.findById(id).orElseThrow(() -> new ResourceNotFoundException("Compte introuvable"));
        if (u.getEmail().equalsIgnoreCase(me.getUsername())) {
            throw new IllegalArgumentException("Vous ne pouvez pas modifier votre propre compte depuis l'administration");
        }
        java.util.List<String> changes = new java.util.ArrayList<>();
        if (req.enabled() != null && req.enabled() != u.isEnabled()) changes.add(req.enabled() ? "réactivé" : "désactivé");
        if (req.role() != null && req.role() != u.getRole()) changes.add("rôle " + u.getRole() + " → " + req.role());
        String agencyBefore = u.getAgency() == null ? null : u.getAgency().getName();
        if (req.enabled() != null) u.setEnabled(req.enabled());
        if (req.role() != null && req.role() != u.getRole()) {
            if (u.getRole() == Role.ACTEUR || req.role() == Role.ACTEUR) {
                throw new IllegalArgumentException("Un compte acteur reste un compte acteur");
            }
            u.setRole(req.role());
            if (req.role() == Role.ADMIN) u.setAgency(null);
        }
        if (req.agencyId() != null && u.getRole() != Role.ADMIN && u.getRole() != Role.ACTEUR) u.setAgency(agencyFor(u.getRole(), req.agencyId(), u.getId()));
        String agencyAfter = u.getAgency() == null ? null : u.getAgency().getName();
        if (!java.util.Objects.equals(agencyBefore, agencyAfter)) changes.add("agence " + (agencyBefore == null ? "aucune" : agencyBefore) + " → " + (agencyAfter == null ? "aucune" : agencyAfter));
        User saved = users.save(u);
        if (!changes.isEmpty()) audit.log("COMPTE_MODIFIE", u.getEmail(), String.join(" ; ", changes));
        return row(saved);
    }

    // ── Import d'acteurs ──

    @PostMapping(value = "/import/actors/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ActorImportService.Preview preview(@RequestParam("file") MultipartFile file) throws Exception {
        if (file.isEmpty()) throw new IllegalArgumentException("Le fichier est vide");
        return importService.preview(file);
    }

    @PostMapping("/import/actors")
    public ActorImportService.CommitResult importActors(@Valid @RequestBody ImportRequest req, @AuthenticationPrincipal UserDetails me) {
        if (req.rows().isEmpty()) throw new IllegalArgumentException("Aucune ligne à importer");
        if (req.rows().size() > ActorImportService.MAX_ROWS) throw new IllegalArgumentException("Trop de lignes en une fois");
        ActorImportService.CommitResult r = importService.commit(req.rows(), me.getUsername());
        audit.log("IMPORT", r.created() + " fiche" + (r.created() > 1 ? "s" : "") + " importée" + (r.created() > 1 ? "s" : ""),
                r.skipped().isEmpty() ? "Aucune ligne écartée" : r.skipped().size() + " ligne(s) écartée(s)");
        return r;
    }

    // ── outils ──

    private static UserRow row(User u) {
        return new UserRow(u.getId(), u.getEmail(), u.getFirstName(), u.getLastName(), u.getRole().name(), u.isEnabled(),
                u.getAuthProvider(), u.getCreatedAt(),
                u.getAgency() == null ? null : u.getAgency().getId(), u.getAgency() == null ? null : u.getAgency().getName(),
                u.getEmailVerifiedAt() != null || !"LOCAL".equals(u.getAuthProvider()));
    }

    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    private static final SecureRandom RNG = new SecureRandom();

    /** 12 caractères sans caractères ambigus (0/O, 1/l). */
    static String temporaryPassword() {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 12; i++) b.append(ALPHABET.charAt(RNG.nextInt(ALPHABET.length())));
        return b.toString();
    }
}
