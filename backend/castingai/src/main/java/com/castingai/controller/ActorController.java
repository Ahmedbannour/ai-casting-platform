package com.castingai.controller;

import com.castingai.dto.actor.ActorCreateRequest;
import com.castingai.dto.actor.ActorResponse;
import com.castingai.dto.actor.ActorSummaryResponse;
import com.castingai.dto.actor.ActorUpdateRequest;
import com.castingai.service.ActorService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * REST controller for actor management.
 */
@RestController
@RequestMapping("/api/actors")
@RequiredArgsConstructor
public class ActorController {

    private final ActorService actorService;

    @PostMapping
    public ResponseEntity<ActorResponse> create(
            @Valid @RequestBody ActorCreateRequest request,
            @AuthenticationPrincipal UserDetails userDetails) {

        System.out.println("Controller reached");
        System.out.println("User = " + userDetails);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(actorService.create(request, userDetails.getUsername()));
    }


    @GetMapping("/search")
    public ResponseEntity<Page<ActorSummaryResponse>> search(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String gender,
            @RequestParam(required = false) Integer minAge,
            @RequestParam(required = false) Integer maxAge,
            @RequestParam(required = false) String city,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "lastName") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {

        Sort sort = sortDir.equalsIgnoreCase("desc")
                ? Sort.by(sortBy).descending()
                : Sort.by(sortBy).ascending();
        PageRequest pageable = PageRequest.of(page, size, sort);

        return ResponseEntity.ok(actorService.searchAdvanced(
                search, gender, minAge, maxAge, city, pageable));
    }


    @GetMapping
    public ResponseEntity<Page<ActorSummaryResponse>> findAll(
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        PageRequest pageable = PageRequest.of(page, size, Sort.by("lastName").ascending());
        return ResponseEntity.ok(actorService.findAll(search, pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ActorResponse> findById(@PathVariable UUID id) {
        return ResponseEntity.ok(actorService.findById(id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ActorResponse> update(
            @PathVariable UUID id,
            @Valid @RequestBody ActorUpdateRequest request) {
        return ResponseEntity.ok(actorService.update(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        actorService.delete(id);
        return ResponseEntity.noContent().build();
    }
}