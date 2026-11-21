package com.castingai.service;

import com.castingai.dto.project.ProjectDtos.ProjectRequest;
import com.castingai.dto.project.ProjectDtos.ProjectResponse;
import com.castingai.entity.Project;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.ForbiddenException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.ProjectRepository;
import com.castingai.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * Projets de casting (MVP, user stories US-01 à US-03).
 * Visibilité : propriétaire, membres du projet, ou administrateur.
 * Archiver / restaurer : propriétaire ou admin. Supprimer définitivement : admin uniquement.
 */
@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<ProjectResponse> list(String email, Project.Status status) {
        User me = user(email);
        List<Project> projects = projectRepository.findVisible(me.getId(), isAdmin(me), AccessService.assistantOrg(me), status);
        Map<UUID, long[]> counts = roleCounts(projects.stream().map(Project::getId).toList());
        return projects.stream().map(p -> toResponse(p, me, counts)).toList();
    }

    @Transactional(readOnly = true)
    public ProjectResponse get(String email, UUID id) {
        User me = user(email);
        Project p = visible(me, id);
        return toResponse(p, me, roleCounts(List.of(p.getId())));
    }

    @Transactional
    public ProjectResponse create(String email, ProjectRequest req) {
        User me = user(email);
        checkDates(req);
        Project p = projectRepository.save(Project.builder()
                .owner(me)
                .title(req.title().trim())
                .type(req.type())
                .description(blankToNull(req.description()))
                .startDate(req.startDate())
                .endDate(req.endDate())
                .build());
        return toResponse(p, me, Map.of());
    }

    @Transactional
    public ProjectResponse update(String email, UUID id, ProjectRequest req) {
        User me = user(email);
        Project p = visible(me, id);
        checkDates(req);
        p.setTitle(req.title().trim());
        p.setType(req.type());
        p.setDescription(blankToNull(req.description()));
        p.setStartDate(req.startDate());
        p.setEndDate(req.endDate());
        return toResponse(projectRepository.save(p), me, roleCounts(List.of(id)));
    }

    @Transactional
    public ProjectResponse setStatus(String email, UUID id, Project.Status status) {
        User me = user(email);
        Project p = visible(me, id);
        if (!isAdmin(me) && !p.getOwner().getId().equals(me.getId())) {
            throw new ForbiddenException("Seul le propriétaire du projet peut changer son état");
        }
        p.setStatus(status);
        return toResponse(projectRepository.save(p), me, roleCounts(List.of(id)));
    }

    @Transactional
    public void delete(String email, UUID id) {
        User me = user(email);
        Project p = visible(me, id);
        if (!isAdmin(me)) {
            throw new ForbiddenException("La suppression définitive est réservée à l'administrateur ; archivez le projet");
        }
        projectRepository.delete(p);
    }

    // ── outils ──

    private User user(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }

    private static boolean isAdmin(User u) {
        return u.getRole() == Role.ADMIN;
    }

    /** Le projet, s'il est visible par l'utilisateur ; sinon 404 (on ne révèle pas son existence). */
    private Project visible(User me, UUID id) {
        Project p = projectRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));
        boolean ok = isAdmin(me) || p.getOwner().getId().equals(me.getId())
                || projectRepository.isMember(id, me.getId()) || AccessService.assistantSees(me, p);
        if (!ok) throw new ResourceNotFoundException("Projet introuvable");
        return p;
    }

    private static void checkDates(ProjectRequest req) {
        if (req.startDate() != null && req.endDate() != null && req.endDate().isBefore(req.startDate())) {
            throw new IllegalArgumentException("La date de fin ne peut pas précéder la date de début");
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private Map<UUID, long[]> roleCounts(List<UUID> ids) {
        if (ids.isEmpty()) return Map.of();
        Map<UUID, long[]> out = new HashMap<>();
        for (Object[] row : projectRepository.countRoles(ids)) {
            out.put((UUID) row[0], new long[]{((Number) row[1]).longValue(), ((Number) row[2]).longValue()});
        }
        return out;
    }

    private static ProjectResponse toResponse(Project p, User me, Map<UUID, long[]> counts) {
        long[] c = counts.getOrDefault(p.getId(), new long[]{0, 0});
        User o = p.getOwner();
        String ownerName = ((o.getFirstName() == null ? "" : o.getFirstName()) + " "
                + (o.getLastName() == null ? "" : o.getLastName())).trim();
        return new ProjectResponse(p.getId(), p.getTitle(), p.getType(), p.getDescription(),
                p.getStartDate(), p.getEndDate(), p.getStatus(), ownerName,
                o.getId().equals(me.getId()), c[0], c[1], p.getCreatedAt(), p.getUpdatedAt());
    }
}
