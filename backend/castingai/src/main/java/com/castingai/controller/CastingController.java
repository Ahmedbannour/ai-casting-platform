package com.castingai.controller;

import com.castingai.dto.project.CastingDtos.*;
import com.castingai.service.RoleService;
import com.castingai.service.ShortlistService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Rôles d'un projet et leurs shortlists (MVP · sprints S4 et S5). */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class CastingController {

    private final RoleService roleService;
    private final ShortlistService shortlistService;

    // ── Rôles ──

    @GetMapping("/projects/{projectId}/roles")
    public List<RoleResponse> roles(@AuthenticationPrincipal UserDetails me, @PathVariable UUID projectId) {
        return roleService.list(me.getUsername(), projectId);
    }

    @PostMapping("/projects/{projectId}/roles")
    public ResponseEntity<RoleResponse> createRole(@AuthenticationPrincipal UserDetails me, @PathVariable UUID projectId,
                                                   @Valid @RequestBody RoleRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(roleService.create(me.getUsername(), projectId, req));
    }

    @PutMapping("/projects/{projectId}/roles/order")
    public List<RoleResponse> reorder(@AuthenticationPrincipal UserDetails me, @PathVariable UUID projectId,
                                      @RequestBody List<UUID> orderedIds) {
        return roleService.reorder(me.getUsername(), projectId, orderedIds);
    }

    @GetMapping("/roles/{id}")
    public RoleResponse role(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) {
        return roleService.get(me.getUsername(), id);
    }

    @PutMapping("/roles/{id}")
    public RoleResponse updateRole(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id,
                                   @Valid @RequestBody RoleRequest req) {
        return roleService.update(me.getUsername(), id, req);
    }

    @DeleteMapping("/roles/{id}")
    public ResponseEntity<Void> deleteRole(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) {
        roleService.delete(me.getUsername(), id);
        return ResponseEntity.noContent().build();
    }

    // ── Shortlists ──

    @GetMapping("/roles/{id}/shortlist")
    public List<EntryResponse> shortlist(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) {
        return shortlistService.list(me.getUsername(), id);
    }

    @PostMapping("/roles/{id}/shortlist")
    public ResponseEntity<EntryResponse> addToShortlist(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id,
                                                        @Valid @RequestBody AddToShortlistRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(shortlistService.add(me.getUsername(), id, req.actorId()));
    }

    @PatchMapping("/shortlist/{entryId}")
    public EntryResponse updateEntry(@AuthenticationPrincipal UserDetails me, @PathVariable UUID entryId,
                                     @RequestBody UpdateEntryRequest req) {
        return shortlistService.update(me.getUsername(), entryId, req);
    }

    @DeleteMapping("/shortlist/{entryId}")
    public ResponseEntity<Void> removeEntry(@AuthenticationPrincipal UserDetails me, @PathVariable UUID entryId) {
        shortlistService.remove(me.getUsername(), entryId);
        return ResponseEntity.noContent().build();
    }
}
