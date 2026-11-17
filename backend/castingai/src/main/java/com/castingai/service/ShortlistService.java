package com.castingai.service;

import com.castingai.dto.project.CastingDtos.EntryResponse;
import com.castingai.dto.project.CastingDtos.UpdateEntryRequest;
import com.castingai.entity.*;
import com.castingai.exception.ConflictException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.Period;
import java.util.*;

/**
 * Shortlists par rôle (MVP, sprint S5 · US-09 à US-14).
 * Statuts : PRESELECTIONNE → AUDITION → RAPPEL → CHOISI, ou REFUSE. Un seul « CHOISI » par rôle ;
 * dès qu'il y en a un, le rôle est « pourvu ». Chaque changement est historisé (shortlist_events).
 */
@Service
@RequiredArgsConstructor
public class ShortlistService {

    private final ShortlistEntryRepository entryRepository;
    private final ShortlistEventRepository eventRepository;
    private final CastingRoleRepository roleRepository;
    private final ActorRepository actorRepository;
    private final ActorPhotoRepository photoRepository;
    private final RoleService roleService;
    private final AccessService access;
    private final ActorScope actorScope;

    @Transactional(readOnly = true)
    public List<EntryResponse> list(String email, UUID roleId) {
        roleService.visibleRole(access.user(email), roleId);
        List<ShortlistEntry> entries = entryRepository.findByRoleWithActor(roleId);
        Map<UUID, String> photos = mainPhotos(entries.stream().map(e -> e.getActor().getId()).toList());
        return entries.stream().map(e -> toResponse(e, photos)).toList();
    }

    @Transactional
    public EntryResponse add(String email, UUID roleId, UUID actorId) {
        User me = access.user(email);
        CastingRole role = roleService.visibleRole(me, roleId);
        if (entryRepository.findByRoleIdAndActorId(roleId, actorId).isPresent()) {
            throw new ConflictException("Cet acteur est déjà dans la shortlist de ce rôle");
        }
        Actor actor = actorRepository.findById(actorId)
                .filter(x -> actorScope.canSee(x.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Acteur introuvable"));
        ShortlistEntry e = entryRepository.save(ShortlistEntry.builder().role(role).actor(actor).addedBy(me).build());
        event(e, null, me);
        return toResponse(e, mainPhotos(List.of(actorId)));
    }

    /** Glisser à droite depuis un rôle (US-09) : ajoute si absent, sans erreur si déjà présent. */
    @Transactional
    public void addFromSwipe(String email, UUID roleId, UUID actorId) {
        if (entryRepository.findByRoleIdAndActorId(roleId, actorId).isEmpty()) add(email, roleId, actorId);
    }

    /** Annulation d'un glissement (↺) : retire l'acteur s'il est encore au premier statut. */
    @Transactional
    public void undoSwipe(String email, UUID roleId, UUID actorId) {
        roleService.visibleRole(access.user(email), roleId);
        entryRepository.findByRoleIdAndActorId(roleId, actorId)
                .filter(e -> e.getStatus() == ShortlistEntry.Status.PRESELECTIONNE)
                .ifPresent(entryRepository::delete);
    }

    @Transactional
    public EntryResponse update(String email, UUID entryId, UpdateEntryRequest req) {
        User me = access.user(email);
        ShortlistEntry e = visibleEntry(me, entryId);
        if (req.status() != null && req.status() != e.getStatus()) {
            ShortlistEntry.Status from = e.getStatus();
            CastingRole role = e.getRole();
            if (req.status() == ShortlistEntry.Status.CHOISI) {
                Optional<ShortlistEntry> chosen = entryRepository.findFirstByRoleIdAndStatus(role.getId(), ShortlistEntry.Status.CHOISI);
                if (chosen.isPresent()) {
                    if (!Boolean.TRUE.equals(req.replaceChosen())) {
                        throw new ConflictException("Un acteur est déjà choisi pour ce rôle : confirmez le remplacement");
                    }
                    ShortlistEntry previous = chosen.get();
                    previous.setStatus(ShortlistEntry.Status.RAPPEL);
                    entryRepository.saveAndFlush(previous);   // libère l'index « un seul choisi » avant le nouveau
                    event(previous, ShortlistEntry.Status.CHOISI, me);
                }
            }
            e.setStatus(req.status());
            event(e, from, me);
        }
        if (req.note() != null) e.setNote(req.note().isBlank() ? null : req.note().trim());
        if (Boolean.TRUE.equals(req.clearAudition())) e.setAuditionDate(null);
        else if (req.auditionDate() != null) e.setAuditionDate(req.auditionDate());
        ShortlistEntry saved = entryRepository.saveAndFlush(e);
        refreshFilled(saved.getRole());
        return toResponse(saved, mainPhotos(List.of(saved.getActor().getId())));
    }

    @Transactional
    public void remove(String email, UUID entryId) {
        ShortlistEntry e = visibleEntry(access.user(email), entryId);
        CastingRole role = e.getRole();
        entryRepository.delete(e);
        entryRepository.flush();
        refreshFilled(role);
    }

    // ── outils ──

    public ShortlistEntry visibleEntry(User me, UUID entryId) {
        ShortlistEntry e = entryRepository.findById(entryId)
                .orElseThrow(() -> new ResourceNotFoundException("Entrée de shortlist introuvable"));
        roleService.visibleRole(me, e.getRole().getId());
        return e;
    }

    private void refreshFilled(CastingRole role) {
        boolean filled = entryRepository.existsByRoleIdAndStatus(role.getId(), ShortlistEntry.Status.CHOISI);
        if (role.isFilled() != filled) {
            role.setFilled(filled);
            roleRepository.save(role);
        }
    }

    private void event(ShortlistEntry e, ShortlistEntry.Status from, User me) {
        eventRepository.save(ShortlistEvent.builder()
                .entryId(e.getId())
                .fromStatus(from == null ? null : from.name())
                .toStatus(e.getStatus().name())
                .userId(me.getId())
                .build());
    }

    private Map<UUID, String> mainPhotos(List<UUID> actorIds) {
        Map<UUID, String> out = new HashMap<>();
        if (actorIds.isEmpty()) return out;
        for (ActorPhoto p : photoRepository.findByActorIdInOrderByIsMainDescCreatedAtAsc(actorIds)) {
            out.putIfAbsent(p.getActor().getId(), p.getUrl());
        }
        return out;
    }

    private static EntryResponse toResponse(ShortlistEntry e, Map<UUID, String> photos) {
        Actor a = e.getActor();
        Integer age = a.getBirthDate() == null ? null : Period.between(a.getBirthDate(), LocalDate.now()).getYears();
        String[] avail = availability(e.getRole(), a);
        return new EntryResponse(e.getId(), e.getRole().getId(), a.getId(), a.getFirstName(), a.getLastName(), age,
                a.getCity(), a.getGender(), photos.get(a.getId()), e.getStatus(), e.getNote(), e.getAuditionDate(),
                e.getCreatedAt(), e.getUpdatedAt(), avail[0], avail[1],
                "PAUSE".equals(a.getVisibility()), a.getAccount() != null);
    }

    /**
     * Les « disponibilités » d'un acteur sont des périodes où il est libre. Si le rôle a des dates de tournage
     * et que l'acteur a déclaré des périodes, on vérifie qu'une période couvre tout le tournage (US-07).
     */
    static String[] availability(CastingRole role, Actor a) {
        LocalDate start = role.getShootStart() != null ? role.getShootStart() : role.getShootEnd();
        LocalDate end = role.getShootEnd() != null ? role.getShootEnd() : role.getShootStart();
        if (start == null || a.getAvailabilities() == null || a.getAvailabilities().isEmpty()) return new String[]{null, null};
        boolean covered = a.getAvailabilities().stream()
                .anyMatch(p -> p.getFromDate() != null && p.getToDate() != null && !p.getFromDate().isAfter(start) && !p.getToDate().isBefore(end));
        if (covered) return new String[]{"OK", "Disponible pendant tout le tournage"};
        java.time.format.DateTimeFormatter f = java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy");
        String periods = a.getAvailabilities().stream()
                .filter(p -> p.getFromDate() != null && p.getToDate() != null)
                .map(p -> p.getFromDate().format(f) + " au " + p.getToDate().format(f))
                .collect(java.util.stream.Collectors.joining(", "));
        return new String[]{"A_VERIFIER", "Disponible seulement du " + periods};
    }
}
