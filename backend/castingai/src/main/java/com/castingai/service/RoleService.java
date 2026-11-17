package com.castingai.service;

import com.castingai.dto.project.CastingDtos.RoleRequest;
import com.castingai.dto.project.CastingDtos.RoleResponse;
import com.castingai.entity.CastingRole;
import com.castingai.entity.Project;
import com.castingai.entity.User;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.CastingRoleRepository;
import com.castingai.repository.ShortlistEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/** Rôles d'un projet (MVP, sprint S4 · US-05, US-06, US-08). */
@Service
@RequiredArgsConstructor
public class RoleService {

    private final CastingRoleRepository roleRepository;
    private final ShortlistEntryRepository entryRepository;
    private final AccessService access;

    @Transactional(readOnly = true)
    public List<RoleResponse> list(String email, UUID projectId) {
        User me = access.user(email);
        access.visibleProject(me, projectId);
        List<CastingRole> roles = roleRepository.findByProjectIdOrderByPositionAscCreatedAtAsc(projectId);
        Map<UUID, Map<String, Long>> counts = counts(roles.stream().map(CastingRole::getId).toList());
        return roles.stream().map(r -> toResponse(r, counts)).toList();
    }

    @Transactional(readOnly = true)
    public RoleResponse get(String email, UUID roleId) {
        CastingRole r = visibleRole(access.user(email), roleId);
        return toResponse(r, counts(List.of(roleId)));
    }

    @Transactional
    public RoleResponse create(String email, UUID projectId, RoleRequest req) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        validate(req);
        withinProject(req, p);
        CastingRole r = CastingRole.builder().project(p).position(roleRepository.countByProjectId(projectId)).build();
        apply(r, req);
        return toResponse(roleRepository.save(r), Map.of());
    }

    @Transactional
    public RoleResponse update(String email, UUID roleId, RoleRequest req) {
        CastingRole r = visibleRole(access.user(email), roleId);
        validate(req);
        withinProject(req, r.getProject());
        apply(r, req);
        return toResponse(roleRepository.save(r), counts(List.of(roleId)));
    }

    @Transactional
    public void delete(String email, UUID roleId) {
        roleRepository.delete(visibleRole(access.user(email), roleId));
    }

    /** Réordonne les rôles d'un projet selon la liste d'identifiants reçue (US-08). */
    @Transactional
    public List<RoleResponse> reorder(String email, UUID projectId, List<UUID> orderedIds) {
        User me = access.user(email);
        access.visibleProject(me, projectId);
        List<CastingRole> roles = roleRepository.findByProjectIdOrderByPositionAscCreatedAtAsc(projectId);
        Map<UUID, CastingRole> byId = new HashMap<>();
        roles.forEach(r -> byId.put(r.getId(), r));
        if (orderedIds == null || orderedIds.size() != roles.size() || !byId.keySet().containsAll(orderedIds)) {
            throw new IllegalArgumentException("La liste doit contenir exactement les rôles du projet");
        }
        for (int i = 0; i < orderedIds.size(); i++) byId.get(orderedIds.get(i)).setPosition(i);
        roleRepository.saveAll(roles);
        return list(email, projectId);
    }

    // ── outils ──

    CastingRole visibleRole(User me, UUID roleId) {
        CastingRole r = roleRepository.findById(roleId)
                .orElseThrow(() -> new ResourceNotFoundException("Rôle introuvable"));
        try {
            access.requireVisible(me, r.getProject());
        } catch (ResourceNotFoundException e) {
            throw new ResourceNotFoundException("Rôle introuvable");
        }
        return r;
    }

    private static void validate(RoleRequest req) {
        if (req.minAge() != null && req.maxAge() != null && req.minAge() > req.maxAge()) {
            throw new IllegalArgumentException("L'âge minimum ne peut pas dépasser l'âge maximum");
        }
        if (req.shootStart() != null && req.shootEnd() != null && req.shootEnd().isBefore(req.shootStart())) {
            throw new IllegalArgumentException("La fin du tournage ne peut pas précéder son début");
        }
        if (req.gender() != null && !req.gender().isBlank() && !List.of("Femme", "Homme").contains(req.gender())) {
            throw new IllegalArgumentException("Genre : Femme, Homme ou vide");
        }
    }

    /** Le tournage d'un rôle tient dans la période du projet, quand celle-ci est connue. */
    private static void withinProject(RoleRequest req, Project p) {
        java.time.format.DateTimeFormatter fr = java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy");
        if (p.getStartDate() != null) {
            for (java.time.LocalDate d : java.util.Arrays.asList(req.shootStart(), req.shootEnd())) {
                if (d != null && d.isBefore(p.getStartDate())) {
                    throw new IllegalArgumentException("Le tournage ne peut pas commencer avant le projet (" + p.getStartDate().format(fr) + ")");
                }
            }
        }
        if (p.getEndDate() != null) {
            for (java.time.LocalDate d : java.util.Arrays.asList(req.shootStart(), req.shootEnd())) {
                if (d != null && d.isAfter(p.getEndDate())) {
                    throw new IllegalArgumentException("Le tournage ne peut pas finir après le projet (" + p.getEndDate().format(fr) + ")");
                }
            }
        }
    }

    private static void apply(CastingRole r, RoleRequest req) {
        r.setName(req.name().trim());
        r.setDescription(blank(req.description()));
        r.setGender(blank(req.gender()));
        r.setMinAge(req.minAge());
        r.setMaxAge(req.maxAge());
        r.setLanguages(join(req.languages()));
        r.setSkills(join(req.skills()));
        r.setCity(blank(req.city()));
        r.setShootStart(req.shootStart());
        r.setShootEnd(req.shootEnd());
        r.setImportance(req.importance() == null ? CastingRole.Importance.SECONDAIRE : req.importance());
    }

    private Map<UUID, Map<String, Long>> counts(List<UUID> roleIds) {
        Map<UUID, Map<String, Long>> out = new HashMap<>();
        if (roleIds.isEmpty()) return out;
        for (Object[] row : entryRepository.countByStatus(roleIds)) {
            out.computeIfAbsent((UUID) row[0], k -> new LinkedHashMap<>()).put(row[1].toString(), (Long) row[2]);
        }
        return out;
    }

    static RoleResponse toResponse(CastingRole r, Map<UUID, Map<String, Long>> counts) {
        Map<String, Long> c = counts.getOrDefault(r.getId(), Map.of());
        long total = c.values().stream().mapToLong(Long::longValue).sum();
        return new RoleResponse(r.getId(), r.getProject().getId(), r.getProject().getTitle(), r.getName(),
                r.getDescription(), r.getGender(), r.getMinAge(), r.getMaxAge(), split(r.getLanguages()),
                split(r.getSkills()), r.getCity(), r.getShootStart(), r.getShootEnd(), r.getImportance(),
                r.getPosition(), r.isFilled(), total, c, searchPrompt(r));
    }

    /**
     * Phrase de recherche pré-remplie à partir du rôle (US-06), écrite dans les tournures que
     * l'analyse de la recherche IA reconnaît (« femme », « entre 25 et 35 ans », « parlant anglais », « à Paris »).
     */
    static String searchPrompt(CastingRole r) {
        List<String> parts = new ArrayList<>();
        parts.add("Femme".equals(r.getGender()) ? "femme" : "Homme".equals(r.getGender()) ? "homme" : "profil");
        if (r.getMinAge() != null && r.getMaxAge() != null) parts.add("entre " + r.getMinAge() + " et " + r.getMaxAge() + " ans");
        else if (r.getMinAge() != null) parts.add("de " + r.getMinAge() + " ans ou plus");
        else if (r.getMaxAge() != null) parts.add("de " + r.getMaxAge() + " ans maximum");
        List<String> langs = split(r.getLanguages());
        if (!langs.isEmpty()) parts.add("parlant " + String.join(" et ", langs.stream().map(String::toLowerCase).toList()));
        List<String> skills = split(r.getSkills());
        if (!skills.isEmpty()) parts.add("avec " + String.join(", ", skills.stream().map(String::toLowerCase).toList()));
        if (r.getCity() != null) parts.add("à " + r.getCity());
        return String.join(" ", parts);
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    private static String join(List<String> list) {
        if (list == null) return null;
        List<String> clean = list.stream().filter(Objects::nonNull).map(String::trim).filter(s -> !s.isEmpty()).distinct().toList();
        return clean.isEmpty() ? null : String.join(",", clean);
    }

    static List<String> split(String s) {
        if (s == null || s.isBlank()) return List.of();
        return Arrays.stream(s.split(",")).map(String::trim).filter(x -> !x.isEmpty()).toList();
    }
}
