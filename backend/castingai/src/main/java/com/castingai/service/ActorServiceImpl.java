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

    @Override
    @Transactional
    public ActorResponse create(ActorCreateRequest request, String createdByEmail) {

        System.out.println("Create actor start");

        Actor actor = actorMapper.toEntity(request);

        System.out.println("Mapper OK");

        User user = userRepository.findByEmail(createdByEmail)
                .orElseThrow(() -> new RuntimeException("User not found"));

        System.out.println("User OK");

        actor.setCreatedBy(user);

        Actor saved = actorRepository.saveAndFlush(actor);

        System.out.println("Saved");

        return actorMapper.toResponse(saved);
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
        return actorRepository.findBySearchTerm(search, pageable)
                .map(actorMapper::toSummary);
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



}