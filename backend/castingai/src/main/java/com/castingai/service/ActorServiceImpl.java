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
    private final ActorScope actorScope;
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
        // T-092 : une fiche créée par un agent reste privée à son agence
        if (user.getRole() == com.castingai.entity.Role.AGENT && user.getAgency() != null) {
            actor.setAgencyId(user.getAgency().getId());
        }

        return actorMapper.toResponse(actorRepository.saveAndFlush(actor));
    }




    @Override
    @Transactional(readOnly = true)
    public ActorResponse findById(UUID id) {
        return actorRepository.findByIdSimple(id)
                .map(this::toVisibleResponse)
                .orElseThrow(() -> new ActorNotFoundException(id));
    }


    @Override
    @Transactional(readOnly = true)
    public Page<ActorSummaryResponse> findAll(String search, Pageable pageable) {
        ActorScope.Scope s = actorScope.current();
        Page<ActorSummaryResponse> page = actorRepository.findBySearchTerm(search, s.all(), s.agency(), pageable)
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
        // T-094 : qui ne voit pas les coordonnées ne peut pas les écraser
        if (actorScope.seesContact(actor)) {
            if (request.getPhone() != null) actor.setPhone(request.getPhone());
            if (request.getEmail() != null) actor.setEmail(request.getEmail());
        }
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

        return toVisibleResponse(actorRepository.save(actor));
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
    public Page<ActorSummaryResponse> searchAdvanced(Filters f, Pageable pageable) {
        ActorScope.Scope s = actorScope.current();
        java.time.LocalDate today = java.time.LocalDate.now();
        int lo = f.minAge() == null ? 0 : Math.max(0, f.minAge());
        int hi = f.maxAge() == null ? 150 : Math.min(150, f.maxAge());
        boolean ageFilter = f.minAge() != null || f.maxAge() != null;
        var langs = norm(f.languages());
        var skills = norm(f.skills());
        Page<ActorSummaryResponse> page = actorRepository.searchAdvanced(
                        f.search() == null ? "" : f.search().trim(),
                        f.gender() == null ? "" : f.gender(),
                        f.city() == null ? "" : f.city().trim(),
                        ageFilter,
                        today.minusYears(lo),            // a au moins lo ans
                        today.minusYears(hi + 1L),       // a au plus hi ans
                        f.minHeight() == null ? 0 : f.minHeight(),
                        f.maxHeight() == null ? 999 : f.maxHeight(),
                        langs.isEmpty() ? java.util.List.of("") : langs, langs.size(),
                        skills.isEmpty() ? java.util.List.of("") : skills, skills.size(),
                        s.all(), s.agency(),
                        pageable)
                .map(actorMapper::toSummary);
        attachMainPhotos(page.getContent());
        return page;
    }

    /** Liste en minuscules, sans vides ni doublons (au plus 10 valeurs). */
    private static java.util.List<String> norm(java.util.List<String> in) {
        if (in == null) return java.util.List.of();
        return in.stream().filter(v -> v != null && !v.isBlank()).map(v -> v.trim().toLowerCase(java.util.Locale.ROOT))
                .distinct().limit(10).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public java.util.Map<String, java.util.List<String>> facets() {
        ActorScope.Scope s = actorScope.current();
        return java.util.Map.of("languages", actorRepository.topLanguages(s.all(), s.agency()),
                "skills", actorRepository.topSkills(s.all(), s.agency()));
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

    /** Réponse avec coordonnées masquées si l'utilisateur ne les voit pas directement (T-094). */
    private ActorResponse toVisibleResponse(Actor actor) {
        ActorResponse r = actorMapper.toResponse(actor);
        if (!actorScope.seesContact(actor)) { r.setPhone(null); r.setEmail(null); r.setContactHidden(true); }
        return r;
    }
}
