package com.castingai.service;

import com.castingai.entity.Project;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.ProjectRepository;
import com.castingai.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

/** Contrôle d'accès commun : un projet (et tout ce qu'il contient) n'est visible que par son équipe et l'admin. */
@Service
@RequiredArgsConstructor
public class AccessService {

    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;

    public User user(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("Utilisateur introuvable"));
    }

    public boolean isAdmin(User u) {
        return u.getRole() == Role.ADMIN;
    }

    /** Vérifie que le projet est visible ; sinon 404 (on ne révèle pas son existence). */
    public void requireVisible(User me, Project p) {
        boolean ok = isAdmin(me) || p.getOwner().getId().equals(me.getId())
                || projectRepository.isMember(p.getId(), me.getId());
        if (!ok) throw new ResourceNotFoundException("Projet introuvable");
    }

    public Project visibleProject(User me, UUID projectId) {
        Project p = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException("Projet introuvable"));
        requireVisible(me, p);
        return p;
    }
}
