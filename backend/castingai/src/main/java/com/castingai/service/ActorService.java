package com.castingai.service;

import com.castingai.dto.actor.ActorCreateRequest;
import com.castingai.dto.actor.ActorResponse;
import com.castingai.dto.actor.ActorSummaryResponse;
import com.castingai.dto.actor.ActorUpdateRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.UUID;

/**
 * Actor management service interface.
 */
public interface ActorService {

    ActorResponse create(ActorCreateRequest request, String createdByEmail);

    /** Création avec l'origine de la fiche : AGENCE, INSCRIPTION ou IMPORT. */
    ActorResponse create(ActorCreateRequest request, String createdByEmail, String source);

    ActorResponse findById(UUID id);

    Page<ActorSummaryResponse> findAll(String search, Pageable pageable);

    ActorResponse update(UUID id, ActorUpdateRequest request);

    Page<ActorSummaryResponse> searchAdvanced(
            String search, String gender,
            Integer minAge, Integer maxAge,
            String city, Pageable pageable);


    void delete(UUID id);

}