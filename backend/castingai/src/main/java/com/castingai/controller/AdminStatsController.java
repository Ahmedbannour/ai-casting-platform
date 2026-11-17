package com.castingai.controller;

import com.castingai.entity.Agency;
import com.castingai.exception.ConflictException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.AgencyRepository;
import com.castingai.service.PlatformStatsService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Tableau de bord de la plateforme : statistiques, agences clientes sous contrat, projets. (Rôle ADMIN.) */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminStatsController {

    private final PlatformStatsService stats;
    private final AgencyRepository agencies;

    public record AgencyRequest(
            @NotBlank(message = "Le nom de l'agence est obligatoire") @Size(max = 160, message = "Nom : 160 caractères au plus") String name,
            @Size(max = 100) String city,
            @Email(message = "Adresse e-mail de contact invalide") @Size(max = 255) String contactEmail,
            @NotNull(message = "La date de début du contrat est obligatoire") LocalDate contractStart,
            LocalDate contractEnd,
            @Min(value = 1, message = "Au moins 1 agent") @Max(value = 1000, message = "1000 agents au plus") Integer maxAgents,
            @Size(max = 2000) String notes) {}

    @GetMapping("/stats")
    public PlatformStatsService.Overview overview(@RequestParam(defaultValue = "12") int months) {
        return stats.overview(months);
    }

    @GetMapping("/agencies")
    public List<PlatformStatsService.AgencyStats> listAgencies() {
        return stats.agencies();
    }

    @PostMapping("/agencies")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public PlatformStatsService.AgencyStats createAgency(@Valid @RequestBody AgencyRequest req) {
        check(req);
        if (agencies.existsByNameIgnoreCase(req.name().trim())) throw new ConflictException("Une agence porte déjà ce nom");
        Agency a = new Agency();
        apply(a, req);
        UUID id = agencies.saveAndFlush(a).getId();
        return find(id);
    }

    @PutMapping("/agencies/{id}")
    @Transactional
    public PlatformStatsService.AgencyStats updateAgency(@PathVariable UUID id, @Valid @RequestBody AgencyRequest req) {
        check(req);
        Agency a = agencies.findById(id).orElseThrow(() -> new ResourceNotFoundException("Agence introuvable"));
        if (!a.getName().equalsIgnoreCase(req.name().trim()) && agencies.existsByNameIgnoreCase(req.name().trim())) {
            throw new ConflictException("Une agence porte déjà ce nom");
        }
        apply(a, req);
        agencies.saveAndFlush(a);
        return find(id);
    }

    @GetMapping("/projects")
    public List<PlatformStatsService.ProjectStats> projects(@RequestParam(required = false) String status) {
        return stats.projects(status);
    }

    // ── outils ──

    private static void check(AgencyRequest req) {
        if (req.contractEnd() != null && req.contractEnd().isBefore(req.contractStart())) {
            throw new IllegalArgumentException("La fin du contrat ne peut pas précéder son début");
        }
    }

    private static void apply(Agency a, AgencyRequest req) {
        a.setName(req.name().trim());
        a.setCity(blank(req.city()));
        a.setContactEmail(req.contactEmail() == null || req.contactEmail().isBlank() ? null : req.contactEmail().trim().toLowerCase());
        a.setContractStart(req.contractStart());
        a.setContractEnd(req.contractEnd());
        a.setMaxAgents(req.maxAgents());
        a.setNotes(blank(req.notes()));
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    private PlatformStatsService.AgencyStats find(UUID id) {
        return stats.agencies().stream().filter(x -> x.id().equals(id)).findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Agence introuvable"));
    }
}
