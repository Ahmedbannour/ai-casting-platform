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

    @GetMapping("/api/demandes/{id}/fiche")
    public SheetService.Sheet get(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return sheets.forRequest(me.getUsername(), id); }

    @GetMapping("/api/rooms/{projectId}/fiche")
    public SheetService.Sheet room(@AuthenticationPrincipal UserDetails me, @PathVariable UUID projectId) { return sheets.forRoom(me.getUsername(), projectId); }

    @PutMapping("/api/demandes/{id}/fiche/champs/{key}")
    public SheetService.Sheet put(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable String key, @RequestBody SheetService.Value v) {
        return sheets.update(me.getUsername(), id, key, v == null ? null : v.value());
    }

    @PostMapping("/api/demandes/{id}/fiche/champs/{key}/accepter")
    public SheetService.Sheet accept(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable String key) { return sheets.accept(me.getUsername(), id, key); }

    @PostMapping("/api/demandes/{id}/fiche/champs/{key}/ecarter")
    public SheetService.Sheet reject(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable String key) { return sheets.reject(me.getUsername(), id, key); }

    @PostMapping(value = "/api/demandes/{id}/fiche/sources", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public SheetService.Sheet file(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @RequestParam("file") MultipartFile file) { return sheets.addFile(me.getUsername(), id, file); }

    @PostMapping("/api/demandes/{id}/fiche/liens")
    public SheetService.Sheet link(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @RequestBody SheetService.Link l) { return sheets.addLink(me.getUsername(), id, l == null ? null : l.url()); }
}
