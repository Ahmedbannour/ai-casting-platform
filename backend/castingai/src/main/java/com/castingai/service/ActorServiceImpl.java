package com.castingai.service;


import com.castingai.dto.actor.*;
import com.castingai.entity.*;
import com.castingai.exception.ActorNotFoundException;
import com.castingai.mapper.ActorMapper;
import com.castingai.repository.ActorRepository;
import com.castingai.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Implementation of ActorService.
 */
@Service
@RequiredArgsConstructor
public class ActorServiceImpl implements ActorService {

    private final ActorRepository actorRepository;
    private final UserRepository userRepository;
    private final ActorMapper actorMapper;
    private final com.castingai.repository.ActorPhotoRepository photoRepository;

    @Override
    @Transactional
    public ActorResponse create(ActorCreateRequest request, String createdByEmail) {
        return create(request, createdByEmail, "AGENCE");
    }

    @Override
    @Transactional
    public ActorResponse create(ActorCreateRequest request, String createdByEmail, String source) {

        Actor actor = actorMapper.toEntity(request);
        actor.setSource(source);

        User user = userRepository.findByEmail(createdByEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        actor.setCreatedBy(user);

        return actorMapper.toResponse(actorRepository.saveAndFlush(actor));
    }




    @Override
    @Transactional(readOnly = true)
    public ActorResponse findById(UUID id) {
        return actorRepository.findByIdSimple(id)
                .map(actorMapper::toResponse)
                .orElseThrow(() -> new ActorNotFoundException(id));
    }


    @Override
    @Transactional(readOnly = true)
    public Page<ActorSummaryResponse> findAll(String search, Pageable pageable) {
        Page<ActorSummaryResponse> page = actorRepository.findBySearchTerm(search, pageable)
                .map(actorMapper::toSummary);
        attachMainPhotos(page.getContent());
        return page;
    }

    @Override
    @Transactional
    public ActorResponse update(UUID id, ActorUpdateRequest request) {
        Actor actor = actorRepository.findById(id)
                .orElseThrow(() -> new ActorNotFoundException(id));

        if (request.getFirstName() != null) actor.setFirstName(request.getFirstName());
        if (request.getLastName() != null) actor.setLastName(request.getLastName());
        if (request.getBirthDate() != null) actor.setBirthDate(request.getBirthDate());
        if (request.getGender() != null) actor.setGender(request.getGender());
        if (request.getCity() != null) actor.setCity(request.getCity());
        if (request.getCountry() != null) actor.setCountry(request.getCountry());
        if (request.getPhone() != null) actor.setPhone(request.getPhone());
        if (request.getEmail() != null) actor.setEmail(request.getEmail());
        if (request.getBio() != null) actor.setBio(request.getBio());
        if (request.getHeight() != null) actor.setHeight(request.getHeight());
        if (request.getWeight() != null) actor.setWeight(request.getWeight());
        if (request.getEyeColor() != null) actor.setEyeColor(request.getEyeColor());
        if (request.getHairColor() != null) actor.setHairColor(request.getHairColor());

        if (request.getSkills() != null) {
            actor.getSkills().clear();
            request.getSkills().forEach(dto -> {
                ActorSkill skill = ActorSkill.builder()
                        .name(dto.getName()).level(dto.getLevel()).actor(actor).build();
                actor.getSkills().add(skill);
            });
        }

        if (request.getLanguages() != null) {
            actor.getLanguages().clear();
            request.getLanguages().forEach(dto -> {
                ActorLanguage lang = ActorLanguage.builder()
                        .name(dto.getName()).level(dto.getLevel()).actor(actor).build();
                actor.getLanguages().add(lang);
            });
        }

        if (request.getExperiences() != null) {
            actor.getExperiences().clear();
            request.getExperiences().forEach(dto -> actor.getExperiences().add(
                    com.castingai.entity.ActorExperience.builder()
                            .title(dto.getTitle()).production(dto.getProduction())
                            .role(dto.getRole()).year(dto.getYear())
                            .description(dto.getDescription()).actor(actor).build()));
        }

        if (request.getAvailabilities() != null) {
            actor.getAvailabilities().clear();
            request.getAvailabilities().forEach(dto -> actor.getAvailabilities().add(
                    com.castingai.entity.ActorAvailability.builder()
                            .fromDate(dto.getFromDate()).toDate(dto.getToDate())
                            .note(dto.getNote()).actor(actor).build()));
        }

        return actorMapper.toResponse(actorRepository.save(actor));
    }

    @Override
    @Transactional
    public void delete(UUID id) {
        if (!actorRepository.existsById(id)) {
            throw new ActorNotFoundException(id);
        }
        actorRepository.deleteById(id);
    }



    @Override
    @Transactional(readOnly = true)
    public Page<ActorSummaryResponse> searchAdvanced(
            String search, String gender,
            Integer minAge, Integer maxAge,
            String city, Pageable pageable) {
        Page<ActorSummaryResponse> page = actorRepository.searchAdvanced(
                        search == null ? "" : search.trim(),
                        gender == null ? "" : gender,
                        minAge == null ? 0 : minAge,
                        maxAge == null ? 150 : maxAge,
                        city == null ? "" : city.trim(),
                        pageable)
                .map(actorMapper::toSummary);
        attachMainPhotos(page.getContent());
        return page;
    }

    /** Ajoute la miniature de la photo principale à une page d'acteurs, en une seule requête. */
    private void attachMainPhotos(java.util.List<ActorSummaryResponse> actors) {
        if (actors.isEmpty()) return;
        var ids = actors.stream().map(ActorSummaryResponse::getId).toList();
        var byActor = new java.util.HashMap<UUID, String>();
        photoRepository.findByActorIdInAndIsMainTrue(ids).forEach(p -> byActor.put(p.getActor().getId(),
                p.getThumbnailUrl() != null ? p.getThumbnailUrl() : p.getUrl()));
        actors.forEach(a -> a.setMainPhotoUrl(byActor.get(a.getId())));
    }


}