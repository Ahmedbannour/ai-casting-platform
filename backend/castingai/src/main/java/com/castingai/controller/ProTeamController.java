package com.castingai.controller;

import com.castingai.dto.auth.AuthResponse;
import com.castingai.service.ProTeamService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Le producer invite la marque, l'agence et ses assistantes ; l'invité ouvre son lien et crée son compte. */
@RestController
@RequiredArgsConstructor
public class ProTeamController {

    private final ProTeamService service;

    @PostMapping("/api/demandes/{id}/invitations")
    public ProTeamService.Result invite(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody ProTeamService.Invite req) {
        return service.inviteToRequest(me.getUsername(), id, req);
    }

    @GetMapping("/api/demandes/{id}/invitations")
    public List<ProTeamService.InvitationView> requestInvitations(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) {
        return service.requestInvitations(me.getUsername(), id);
    }

    @GetMapping("/api/production/equipe")
    public ProTeamService.Team team(@AuthenticationPrincipal UserDetails me) {
        return service.team(me.getUsername());
    }

    @PostMapping("/api/production/assistantes")
    public ProTeamService.Result inviteAssistant(@AuthenticationPrincipal UserDetails me, @Valid @RequestBody ProTeamService.AssistantInvite req) {
        return service.inviteAssistant(me.getUsername(), req);
    }

    @PutMapping("/api/production/assistantes/{userId}")
    public ProTeamService.AssistantView updateAssistant(@AuthenticationPrincipal UserDetails me, @PathVariable UUID userId,
                                                        @RequestBody ProTeamService.AssistantUpdate req) {
        return service.updateAssistant(me.getUsername(), userId, req);
    }

    @DeleteMapping("/api/production/invitations/{invitationId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@AuthenticationPrincipal UserDetails me, @PathVariable UUID invitationId) {
        service.revoke(me.getUsername(), invitationId);
    }

    @GetMapping("/api/public/invitations-pro/{token}")
    public ProTeamService.Preview preview(@PathVariable String token) {
        return service.preview(token);
    }

    @PostMapping("/api/public/invitations-pro/{token}/accept")
    public AuthResponse accept(@PathVariable String token, @Valid @RequestBody ProTeamService.Accept req) {
        return service.accept(token, req);
    }
}
