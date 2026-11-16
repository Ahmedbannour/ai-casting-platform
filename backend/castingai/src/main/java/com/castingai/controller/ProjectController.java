package com.castingai.controller;

import com.castingai.dto.project.ProjectDtos.ProjectRequest;
import com.castingai.dto.project.ProjectDtos.ProjectResponse;
import com.castingai.entity.Project;
import com.castingai.service.ProjectService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Projets de casting (MVP · sprint S3). */
@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

    @GetMapping
    public List<ProjectResponse> list(@AuthenticationPrincipal UserDetails me,
                                      @RequestParam(required = false) Project.Status status) {
        return projectService.list(me.getUsername(), status);
    }

    @GetMapping("/{id}")
    public ProjectResponse get(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) {
        return projectService.get(me.getUsername(), id);
    }

    @PostMapping
    public ResponseEntity<ProjectResponse> create(@AuthenticationPrincipal UserDetails me,
                                                  @Valid @RequestBody ProjectRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(projectService.create(me.getUsername(), req));
    }

    @PutMapping("/{id}")
    public ProjectResponse update(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id,
                                  @Valid @RequestBody ProjectRequest req) {
        return projectService.update(me.getUsername(), id, req);
    }

    @PostMapping("/{id}/archive")
    public ProjectResponse archive(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) {
        return projectService.setStatus(me.getUsername(), id, Project.Status.ARCHIVE);
    }

    @PostMapping("/{id}/restore")
    public ProjectResponse restore(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) {
        return projectService.setStatus(me.getUsername(), id, Project.Status.EN_COURS);
    }

    @PostMapping("/{id}/finish")
    public ProjectResponse finish(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) {
        return projectService.setStatus(me.getUsername(), id, Project.Status.TERMINE);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UserDetails me, @PathVariable UUID id) {
        projectService.delete(me.getUsername(), id);
        return ResponseEntity.noContent().build();
    }
}
