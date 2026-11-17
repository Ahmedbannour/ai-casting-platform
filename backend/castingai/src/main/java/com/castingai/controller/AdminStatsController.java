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
    private final com.castingai.service.AuditService audit;
    private final AgencyRepository agencies;

    public record AgencyRequest(
            @NotBlank(message = "Le nom de l'agence est obligatoire") @Size(max = 160, message = "Nom : 160 caractères au plus") String name,
            @Size(max = 100) String city,
            @Email(message = "Adresse e-mail de contact invalide") @Size(max = 255) String contactEmail,
            @NotNull(message = "La date de début du contrat est obligatoire") LocalDate contractStart,
            LocalDate contractEnd,
            @Min(value = 1, message = "Au moins 1 agent") @Max(value = 1000, message = "1000 agents au plus") Integer maxAgents,
            @Size(max = 2000) String notes,
            @jakarta.validation.constraints.Pattern(regexp = "^$|ESSENTIEL|PRO|STUDIO|SUR_MESURE", message = "Forfait inconnu") String plan,
            @jakarta.validation.constraints.DecimalMin(value = "0", message = "Le montant mensuel ne peut pas être négatif")
            @jakarta.validation.constraints.DecimalMax(value = "1000000", message = "Montant mensuel trop élevé") java.math.BigDecimal monthlyAmount,
            @jakarta.validation.constraints.Pattern(regexp = "^$|TND|EUR|USD", message = "Devise attendue : TND, EUR ou USD") String currency) {}

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
        audit.log("AGENCE_CREEE", a.getName(), contract(a));
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
        String before = contract(a);
        apply(a, req);
        agencies.saveAndFlush(a);
        String after = contract(a);
        if (!before.equals(after)) audit.log("CONTRAT_MODIFIE", a.getName(), before + "  →  " + after);
        return find(id);
    }

    @GetMapping("/projects")
    public List<PlatformStatsService.ProjectStats> projects(@RequestParam(required = false) String status) {
        return stats.projects(status);
    }

    // ── outils ──

    /** Résumé lisible du contrat, pour le journal d'audit. */
    private static String contract(Agency a) {
        java.time.format.DateTimeFormatter f = java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy");
        return "du " + a.getContractStart().format(f) + (a.getContractEnd() == null ? " sans fin" : " au " + a.getContractEnd().format(f))
                + (a.getPlan() == null ? "" : ", " + a.getPlan())
                + (a.getMonthlyAmount() == null ? "" : ", " + a.getMonthlyAmount().stripTrailingZeros().toPlainString() + " " + a.getCurrency() + "/mois")
                + (a.getMaxAgents() == null ? "" : ", " + a.getMaxAgents() + " agents max");
    }

    @GetMapping("/audit")
    public List<com.castingai.service.AuditService.Entry> audit(@RequestParam(required = false) String action,
                                                                @RequestParam(defaultValue = "200") int limit) {
        return audit.recent(action, limit);
    }

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
        a.setPlan(blank(req.plan()));
        a.setMonthlyAmount(req.monthlyAmount());
        a.setCurrency(blank(req.currency()) == null ? "TND" : req.currency());
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    private PlatformStatsService.AgencyStats find(UUID id) {
        return stats.agencies().stream().filter(x -> x.id().equals(id)).findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Agence introuvable"));
    }
}
