package com.castingai.service;

import com.castingai.dto.project.TeamDtos.ActivityItem;
import com.castingai.dto.project.TeamDtos.MemberResponse;
import com.castingai.entity.Project;
import com.castingai.entity.ProjectMember;
import com.castingai.entity.User;
import com.castingai.exception.ConflictException;
import com.castingai.exception.ForbiddenException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.ProjectMemberRepository;
import com.castingai.repository.UserRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Équipe d'un projet (US-04) et journal d'activité (US-17).
 * Inviter ou retirer un membre : propriétaire ou administrateur. Un membre peut se retirer lui-même.
 */
@Service
@RequiredArgsConstructor
public class TeamService {

    private final AccessService access;
    private final ProjectMemberRepository memberRepository;
    private final UserRepository userRepository;
    private final EntityManager em;

    @Transactional(readOnly = true)
    public List<MemberResponse> members(String email, UUID projectId) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        List<MemberResponse> out = new ArrayList<>();
        User o = p.getOwner();
        out.add(new MemberResponse(o.getId(), name(o), o.getEmail(), true, p.getCreatedAt()));
        List<ProjectMember> list = memberRepository.findByProjectIdOrderByAddedAtAsc(projectId);
        Map<UUID, User> users = new HashMap<>();
        userRepository.findAllById(list.stream().map(ProjectMember::getUserId).toList()).forEach(u -> users.put(u.getId(), u));
        for (ProjectMember m : list) {
            User u = users.get(m.getUserId());
            if (u != null) out.add(new MemberResponse(u.getId(), name(u), u.getEmail(), false, m.getAddedAt()));
        }
        return out;
    }

    @Transactional
    public MemberResponse add(String email, UUID projectId, String memberEmail) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        requireOwnerOrAdmin(me, p);
        User u = userRepository.findByEmail(memberEmail.trim().toLowerCase())
                .or(() -> userRepository.findByEmail(memberEmail.trim()))
                .orElseThrow(() -> new ResourceNotFoundException("Aucun compte n'utilise cette adresse e-mail"));
        if (u.getRole() == com.castingai.entity.Role.ACTEUR) {
            throw new IllegalArgumentException("Ce compte est un compte acteur : seuls les agents de l'agence peuvent rejoindre un projet");
        }
        // T-092 : l'équipe d'un projet reste dans l'agence de son propriétaire
        var ownerAgency = p.getOwner().getAgency();
        if (u.getRole() == com.castingai.entity.Role.BOITE_PROD && ownerAgency != null
                && (u.getAgency() == null || !ownerAgency.getId().equals(u.getAgency().getId()))) {
            throw new IllegalArgumentException("Ce compte n'appartient pas à votre agence : seuls ses agents peuvent rejoindre le projet");
        }
        if (u.getId().equals(p.getOwner().getId()) || memberRepository.existsByProjectIdAndUserId(projectId, u.getId())) {
            throw new ConflictException("Cette personne fait déjà partie de l'équipe");
        }
        ProjectMember m = memberRepository.save(new ProjectMember(projectId, u.getId(), LocalDateTime.now()));
        return new MemberResponse(u.getId(), name(u), u.getEmail(), false, m.getAddedAt());
    }

    @Transactional
    public void remove(String email, UUID projectId, UUID userId) {
        User me = access.user(email);
        Project p = access.visibleProject(me, projectId);
        if (userId.equals(p.getOwner().getId())) throw new ForbiddenException("Le propriétaire ne peut pas être retiré du projet");
        if (!me.getId().equals(userId)) requireOwnerOrAdmin(me, p);
        if (!memberRepository.existsByProjectIdAndUserId(projectId, userId)) throw new ResourceNotFoundException("Membre introuvable");
        memberRepository.deleteByProjectIdAndUserId(projectId, userId);
    }

    /** Journal : changements de statut dans les shortlists du projet, du plus récent au plus ancien. */
    @Transactional(readOnly = true)
    public List<ActivityItem> activity(String email, UUID projectId, int limit) {
        access.visibleProject(access.user(email), projectId);
        @SuppressWarnings("unchecked")
        List<Object[]> rows = em.createNativeQuery("""
            select e.at, trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')),
                   a.id, a.first_name || ' ' || a.last_name, r.id, r.name, e.from_status, e.to_status
            from shortlist_events e
            join shortlist_entries s on s.id = e.entry_id
            join casting_roles r on r.id = s.role_id
            join actors a on a.id = s.actor_id
            left join users u on u.id = e.user_id
            where r.project_id = :projectId
            order by e.at desc
            limit :limit
            """).setParameter("projectId", projectId).setParameter("limit", Math.max(1, Math.min(limit, 200))).getResultList();
        return rows.stream().map(x -> new ActivityItem(
                x[0] instanceof Timestamp t ? t.toLocalDateTime() : (LocalDateTime) x[0],
                (String) x[1], (UUID) x[2], (String) x[3], (UUID) x[4], (String) x[5], (String) x[6], (String) x[7])).toList();
    }

    private void requireOwnerOrAdmin(User me, Project p) {
        if (!access.isAdmin(me) && !p.getOwner().getId().equals(me.getId())) {
            throw new ForbiddenException("Seul le propriétaire du projet peut gérer l'équipe");
        }
    }

    private static String name(User u) {
        return ((u.getFirstName() == null ? "" : u.getFirstName()) + " " + (u.getLastName() == null ? "" : u.getLastName())).trim();
    }
}
