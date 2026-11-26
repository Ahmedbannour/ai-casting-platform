package com.castingai.sheet;

import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

/** P-083 · Fiche unique du projet : lecture (projet ou room), écriture par étape, dépôts lus par l'IA. */
@RestController
@RequiredArgsConstructor
public class SheetController {

    private final SheetService sheets;
    private final CrewService crew;

    @GetMapping("/api/demandes/{id}/fiche")
    public SheetService.Sheet get(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return sheets.forRequest(me.getUsername(), id); }

    @GetMapping("/api/rooms/{projectId}/fiche")
    public SheetService.Sheet room(@AuthenticationPrincipal UserDetails me, @PathVariable UUID projectId) { return sheets.forRoom(me.getUsername(), projectId); }

    @PutMapping("/api/demandes/{id}/fiche/champs/{key}")
    public SheetService.Sheet put(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable String key, @RequestBody SheetService.Value v) {
        return sheets.update(me.getUsername(), id, key, v == null ? null : v.value());
    }

    @PostMapping("/api/demandes/{id}/fiche/champs/{key}/proposer")
    public SheetService.Draft propose(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable String key, @RequestBody(required = false) SheetService.Value v) {
        return sheets.propose(me.getUsername(), id, key, v == null ? null : v.value());
    }

    @PostMapping("/api/demandes/{id}/fiche/champs/{key}/accepter")
    public SheetService.Sheet accept(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable String key) { return sheets.accept(me.getUsername(), id, key); }

    @PostMapping("/api/demandes/{id}/fiche/champs/{key}/ecarter")
    public SheetService.Sheet reject(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable String key) { return sheets.reject(me.getUsername(), id, key); }

    @PostMapping(value = "/api/demandes/{id}/fiche/sources", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SheetService.Sheet file(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @RequestParam("file") MultipartFile file) { return sheets.addFile(me.getUsername(), id, file); }

    @PostMapping("/api/demandes/{id}/fiche/etapes/{action}")
    public SheetService.Sheet step(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable String action, @RequestBody(required = false) SheetService.Step s) {
        return sheets.step(me.getUsername(), id, action, s == null ? null : s.comment());
    }

    @PostMapping("/api/demandes/{id}/fiche/roles")
    public SheetService.Sheet addRole(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @RequestBody SheetService.RoleInput in) { return sheets.addRole(me.getUsername(), id, in); }

    @PutMapping("/api/demandes/{id}/fiche/roles/{roleId}")
    public SheetService.Sheet updateRole(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID roleId, @RequestBody SheetService.RoleInput in) { return sheets.updateRole(me.getUsername(), id, roleId, in); }

    @DeleteMapping("/api/demandes/{id}/fiche/roles/{roleId}")
    public SheetService.Sheet deleteRole(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID roleId) { return sheets.deleteRole(me.getUsername(), id, roleId); }

    @PostMapping("/api/demandes/{id}/fiche/liens")
    public SheetService.Sheet link(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @RequestBody SheetService.Link l) { return sheets.addLink(me.getUsername(), id, l == null ? null : l.url()); }

    // ── P-087 · Documents et liens ──

    @GetMapping("/api/demandes/{id}/fiche/sources/{sourceId}/fichier")
    public org.springframework.http.ResponseEntity<byte[]> file(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID sourceId,
                                                                 @RequestParam(name = "telecharger", defaultValue = "false") boolean download) {
        return send(sheets.file(me.getUsername(), id, sourceId), download);
    }

    @PostMapping("/api/demandes/{id}/fiche/sources/{sourceId}/partage")
    public SheetService.ShareLink share(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID sourceId) { return sheets.share(me.getUsername(), id, sourceId); }

    @DeleteMapping("/api/demandes/{id}/fiche/sources/{sourceId}")
    public SheetService.Sheet deleteSource(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID sourceId) { return sheets.deleteSource(me.getUsername(), id, sourceId); }

    @GetMapping("/api/public/fichiers/{token}")
    public org.springframework.http.ResponseEntity<byte[]> shared(@PathVariable String token,
                                                                   @RequestParam(name = "telecharger", defaultValue = "false") boolean download) {
        return send(sheets.shared(token), download);
    }

    static org.springframework.http.ResponseEntity<byte[]> send(SheetService.FileData f, boolean download) {
        String name = f.name() == null ? "document" : f.name();
        var cd = (download ? org.springframework.http.ContentDisposition.attachment() : org.springframework.http.ContentDisposition.inline())
                .filename(name, java.nio.charset.StandardCharsets.UTF_8).build();
        return org.springframework.http.ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, cd.toString())
                .header("X-Content-Type-Options", "nosniff")
                .header(org.springframework.http.HttpHeaders.CACHE_CONTROL, "private, max-age=300")
                .contentType(MediaType.parseMediaType(f.type() == null ? "application/octet-stream" : f.type()))
                .body(f.bytes());
    }

    // ── P-087 · Équipe technique ──

    @PutMapping("/api/demandes/{id}/fiche/equipe/{post}")
    public SheetService.Sheet saveCrew(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable String post, @RequestBody CrewService.Contact c) {
        return sheets.saveCrew(me.getUsername(), id, post, c);
    }

    @DeleteMapping("/api/demandes/{id}/fiche/equipe/{post}")
    public SheetService.Sheet clearCrew(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable String post) {
        return sheets.clearCrew(me.getUsername(), id, post);
    }

    @PostMapping("/api/demandes/{id}/fiche/equipe/{post}/lien")
    public CrewService.Invite inviteCrew(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable String post,
                                         @RequestBody(required = false) CrewService.Contact c) {
        return sheets.inviteCrew(me.getUsername(), id, post, c);
    }

    @GetMapping("/api/public/equipe/{token}")
    public CrewService.Preview crewInvite(@PathVariable String token) { return crew.preview(token); }

    @PostMapping("/api/public/equipe/{token}")
    public com.castingai.dto.auth.AuthResponse crewJoin(@PathVariable String token, @RequestBody CrewService.Join j, jakarta.servlet.http.HttpServletRequest req) {
        return crew.join(token, j, req.getRemoteAddr());
    }
}
