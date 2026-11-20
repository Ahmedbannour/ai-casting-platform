package com.castingai.controller;

import com.castingai.service.RoomService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

/** Room de casting d'un projet : équipe et autorisations, swipe, résultats, documents partagés, tâches. */
@RestController
@RequestMapping("/api/rooms")
@RequiredArgsConstructor
public class RoomController {

    private final RoomService rooms;

    @GetMapping
    public List<RoomService.RoomItem> mine(@AuthenticationPrincipal UserDetails me) { return rooms.mine(me.getUsername()); }

    @GetMapping("/{id}")
    public RoomService.RoomSummary room(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return rooms.room(me.getUsername(), id); }

    // Équipe
    @PostMapping("/{id}/membres")
    public RoomService.RoomSummary invite(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody RoomService.InviteRequest req) { return rooms.invite(me.getUsername(), id, req); }
    @PutMapping("/{id}/membres/{userId}")
    public RoomService.RoomSummary perms(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID userId, @RequestBody RoomService.PermsRequest req) { return rooms.setPerms(me.getUsername(), id, userId, req); }
    @DeleteMapping("/{id}/membres/{userId}")
    public RoomService.RoomSummary remove(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID userId) { return rooms.removeMember(me.getUsername(), id, userId); }

    // Swipe et résultats
    @GetMapping("/{id}/roles/{roleId}/swipe")
    public List<RoomService.Card> deck(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID roleId) { return rooms.deck(me.getUsername(), id, roleId); }
    @PutMapping("/{id}/votes/{entryId}")
    public RoomService.VoteResult vote(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID entryId, @RequestBody RoomService.VoteRequest req) { return rooms.vote(me.getUsername(), id, entryId, req); }
    @DeleteMapping("/{id}/votes/{entryId}")
    public void unvote(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID entryId) { rooms.unvote(me.getUsername(), id, entryId); }
    @GetMapping("/{id}/roles/{roleId}/resultats")
    public List<RoomService.ResultRow> results(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID roleId) { return rooms.results(me.getUsername(), id, roleId); }
    @PutMapping("/{id}/choix/{entryId}")
    public List<RoomService.ResultRow> rank(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID entryId, @RequestBody RoomService.RankRequest req) { return rooms.rank(me.getUsername(), id, entryId, req); }

    // Documents
    @GetMapping("/{id}/documents")
    public List<RoomService.DocView> documents(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return rooms.documents(me.getUsername(), id); }
    @PostMapping(value = "/{id}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public List<RoomService.DocView> upload(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @RequestParam("file") MultipartFile file,
                                            @RequestParam(value = "audience", required = false) List<String> audience) { return rooms.upload(me.getUsername(), id, file, audience); }
    @PostMapping(value = "/{id}/documents/{docId}/version", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public List<RoomService.DocView> replace(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID docId, @RequestParam("file") MultipartFile file) { return rooms.replace(me.getUsername(), id, docId, file); }
    @PutMapping("/{id}/documents/{docId}/audience")
    public List<RoomService.DocView> audience(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID docId, @RequestBody RoomService.AudienceRequest req) { return rooms.setAudience(me.getUsername(), id, docId, req); }
    @DeleteMapping("/{id}/documents/{docId}")
    public List<RoomService.DocView> deleteDoc(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID docId) { return rooms.deleteDoc(me.getUsername(), id, docId); }
    @GetMapping("/{id}/documents/{docId}/fichier")
    public ResponseEntity<byte[]> file(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID docId) {
        RoomService.FileData f = rooms.file(me.getUsername(), id, docId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(f.name(), StandardCharsets.UTF_8).build().toString())
                .contentType(f.type() == null ? MediaType.APPLICATION_OCTET_STREAM : MediaType.parseMediaType(f.type()))
                .body(f.bytes());
    }

    // Tâches
    @GetMapping("/{id}/taches")
    public List<RoomService.TaskView> tasks(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) { return rooms.tasks(me.getUsername(), id); }
    @PostMapping("/{id}/taches")
    public List<RoomService.TaskView> addTask(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @Valid @RequestBody RoomService.TaskRequest req) { return rooms.addTask(me.getUsername(), id, req); }
    @PutMapping("/{id}/taches/{taskId}")
    public List<RoomService.TaskView> updateTask(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID taskId, @Valid @RequestBody RoomService.TaskRequest req) { return rooms.updateTask(me.getUsername(), id, taskId, req); }
    @PutMapping("/{id}/taches/{taskId}/etat")
    public List<RoomService.TaskView> moveTask(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID taskId, @RequestBody RoomService.TaskMove req) { return rooms.moveTask(me.getUsername(), id, taskId, req); }
    @DeleteMapping("/{id}/taches/{taskId}")
    public List<RoomService.TaskView> deleteTask(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id, @PathVariable UUID taskId) { return rooms.deleteTask(me.getUsername(), id, taskId); }
}
