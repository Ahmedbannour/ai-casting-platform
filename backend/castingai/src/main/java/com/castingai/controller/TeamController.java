package com.castingai.controller;

import com.castingai.dto.project.TeamDtos.*;
import com.castingai.service.TeamService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Équipe d'un projet et journal d'activité (MVP · sprint S6). */
@RestController
@RequestMapping("/api/projects/{projectId}")
@RequiredArgsConstructor
public class TeamController {

    private final TeamService teamService;

    @GetMapping("/members")
    public List<MemberResponse> members(@AuthenticationPrincipal UserDetails me, @PathVariable UUID projectId) {
        return teamService.members(me.getUsername(), projectId);
    }

    @PostMapping("/members")
    public ResponseEntity<MemberResponse> add(@AuthenticationPrincipal UserDetails me, @PathVariable UUID projectId,
                                              @Valid @RequestBody AddMemberRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(teamService.add(me.getUsername(), projectId, req.email()));
    }

    @DeleteMapping("/members/{userId}")
    public ResponseEntity<Void> remove(@AuthenticationPrincipal UserDetails me, @PathVariable UUID projectId, @PathVariable UUID userId) {
        teamService.remove(me.getUsername(), projectId, userId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/activity")
    public List<ActivityItem> activity(@AuthenticationPrincipal UserDetails me, @PathVariable UUID projectId,
                                       @RequestParam(defaultValue = "50") int limit) {
        return teamService.activity(me.getUsername(), projectId, limit);
    }
}
