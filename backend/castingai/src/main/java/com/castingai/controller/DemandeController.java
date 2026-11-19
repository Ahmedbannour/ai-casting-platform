package com.castingai.controller;

import com.castingai.service.DemandeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/** Cahier v2, sprint 2 · Demandes de publicité : brouillon, V0, envoi à l'agence, journal. */
@RestController
@RequestMapping("/api/demandes")
@RequiredArgsConstructor
public class DemandeController {
    private final DemandeService demandes;

    @GetMapping public List<DemandeService.Summary> mine(@AuthenticationPrincipal UserDetails me) { return demandes.mine(me.getUsername()); }
    @GetMapping("/agences") public List<DemandeService.AgencyOption> agencies() { return demandes.agencies(); }
    @GetMapping("/{id}") public DemandeService.Detail detail(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return demandes.detail(me.getUsername(), id); }

    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public DemandeService.Detail create(@AuthenticationPrincipal UserDetails me, @Valid @RequestBody DemandeService.DemandeRequest req) { return demandes.create(me.getUsername(), req); }
    @PutMapping("/{id}")
    public DemandeService.Detail update(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody DemandeService.DemandeRequest req) { return demandes.update(me.getUsername(), id, req); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { demandes.delete(me.getUsername(), id); }

    @PutMapping("/{id}/v0")
    public DemandeService.Detail v0Text(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody DemandeService.V0Text req) { return demandes.saveV0Text(me.getUsername(), id, req); }
    @PostMapping(value = "/{id}/v0/fichier", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public DemandeService.Detail v0File(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @RequestParam("file") MultipartFile file) { return demandes.uploadV0File(me.getUsername(), id, file); }
    @DeleteMapping("/{id}/v0/fichier")
    public DemandeService.Detail v0FileRemove(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return demandes.removeV0File(me.getUsername(), id); }

    @PostMapping("/{id}/envoyer")
    public DemandeService.Detail send(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody DemandeService.Send req) { return demandes.send(me.getUsername(), id, req); }
    @PostMapping("/{id}/annuler")
    public DemandeService.Detail cancel(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return demandes.cancel(me.getUsername(), id); }

    @PostMapping("/{id}/accepter")
    public DemandeService.Detail accept(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return demandes.accept(me.getUsername(), id); }
    @PostMapping("/{id}/refuser")
    public DemandeService.Detail refuse(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody DemandeService.Refuse req) { return demandes.refuse(me.getUsername(), id, req); }
    @PostMapping("/{id}/analyse")
    public DemandeService.Detail analyse(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return demandes.analyse(me.getUsername(), id); }

    // T-161 · V1 de l'agence, révisions, production
    @PutMapping("/{id}/v1")
    public DemandeService.Detail v1Text(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody DemandeService.V0Text req) { return demandes.saveV1Text(me.getUsername(), id, req); }
    @PostMapping(value = "/{id}/v1/fichier", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public DemandeService.Detail v1File(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @RequestParam("file") MultipartFile file) { return demandes.uploadV1File(me.getUsername(), id, file); }
    @DeleteMapping("/{id}/v1/fichier")
    public DemandeService.Detail v1FileRemove(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return demandes.removeV1File(me.getUsername(), id); }
    @PostMapping("/{id}/v1/livrer")
    public DemandeService.Detail deliverV1(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return demandes.deliverV1(me.getUsername(), id); }
    @PostMapping("/{id}/v1/revision")
    public DemandeService.Detail reviseV1(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody DemandeService.Comment req) { return demandes.reviseV1(me.getUsername(), id, req); }
    @PostMapping("/{id}/v1/valider")
    public DemandeService.Detail validateV1(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return demandes.validateV1(me.getUsername(), id); }
    @GetMapping("/productions") public List<DemandeService.AgencyOption> productions() { return demandes.productions(); }
    @PostMapping("/{id}/production")
    public DemandeService.Detail production(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody DemandeService.ChooseProduction req) { return demandes.chooseProduction(me.getUsername(), id, req); }

    // T-162 · Attentes par personnage, transmission au réalisateur et au 1er AD
    @PostMapping("/{id}/personnages")
    public DemandeService.Detail addCharacter(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody DemandeService.CharacterRequest req) { return demandes.addCharacter(me.getUsername(), id, req); }
    @PutMapping("/{id}/personnages/{cid}")
    public DemandeService.Detail updateCharacter(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID cid, @Valid @RequestBody DemandeService.CharacterRequest req) { return demandes.updateCharacter(me.getUsername(), id, cid, req); }
    @DeleteMapping("/{id}/personnages/{cid}")
    public DemandeService.Detail deleteCharacter(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID cid) { return demandes.deleteCharacter(me.getUsername(), id, cid); }
    @GetMapping("/realisateurs") public List<DemandeService.PersonOption> directors(@AuthenticationPrincipal UserDetails me) { return demandes.directors(me.getUsername()); }
    @PostMapping("/{id}/transmettre")
    public DemandeService.Detail transmit(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody DemandeService.Transmit req) { return demandes.transmit(me.getUsername(), id, req); }

    // T-163 · V2 du réalisateur : texte, fichier, scènes, fiches de rôle, publication
    @PutMapping("/{id}/v2")
    public DemandeService.Detail v2Text(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody DemandeService.V0Text req) { return demandes.saveV2Text(me.getUsername(), id, req); }
    @PostMapping(value = "/{id}/v2/fichier", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public DemandeService.Detail v2File(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @RequestParam("file") MultipartFile file) { return demandes.uploadV2File(me.getUsername(), id, file); }
    @DeleteMapping("/{id}/v2/fichier")
    public DemandeService.Detail v2FileRemove(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return demandes.removeV2File(me.getUsername(), id); }
    @PostMapping("/{id}/scenes")
    public DemandeService.Detail addScene(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody DemandeService.SceneRequest req) { return demandes.addScene(me.getUsername(), id, req); }
    @PutMapping("/{id}/scenes/{sid}")
    public DemandeService.Detail updateScene(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID sid, @Valid @RequestBody DemandeService.SceneRequest req) { return demandes.updateScene(me.getUsername(), id, sid, req); }
    @DeleteMapping("/{id}/scenes/{sid}")
    public DemandeService.Detail deleteScene(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID sid) { return demandes.deleteScene(me.getUsername(), id, sid); }
    @PostMapping("/{id}/roles")
    public DemandeService.Detail addRole(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody DemandeService.RoleSheetRequest req) { return demandes.addRoleSheet(me.getUsername(), id, req); }
    @PutMapping("/{id}/roles/{rid}")
    public DemandeService.Detail updateRole(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID rid, @Valid @RequestBody DemandeService.RoleSheetRequest req) { return demandes.updateRoleSheet(me.getUsername(), id, rid, req); }
    @DeleteMapping("/{id}/roles/{rid}")
    public DemandeService.Detail deleteRole(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID rid) { return demandes.deleteRoleSheet(me.getUsername(), id, rid); }
    @PostMapping("/{id}/v2/publier")
    public DemandeService.Detail publishV2(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return demandes.publishV2(me.getUsername(), id); }

    @GetMapping("/{id}/versions/{versionId}/fichier")
    public ResponseEntity<byte[]> file(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID versionId) {
        DemandeService.FileData f = demandes.file(me.getUsername(), id, versionId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(f.name(), StandardCharsets.UTF_8).build().toString())
                .contentType(f.type() == null ? MediaType.APPLICATION_OCTET_STREAM : MediaType.parseMediaType(f.type()))
                .body(f.bytes());
    }
}
