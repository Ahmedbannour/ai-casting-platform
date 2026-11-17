package com.castingai.service;

import com.castingai.dto.actor.*;
import com.castingai.dto.availability.AvailabilityDto;
import com.castingai.dto.experience.ExperienceDto;
import com.castingai.dto.language.LanguageDto;
import com.castingai.dto.photo.PhotoResponse;
import com.castingai.dto.skill.SkillDto;
import com.castingai.entity.ActorComment;
import com.castingai.entity.ActorDocument;
import com.castingai.exception.ActorNotFoundException;
import com.castingai.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.Period;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ActorDetailServiceImpl implements ActorDetailService {

    private final ActorRepository actorRepository;
    private final ActorCommentRepository commentRepository;
    private final ActorPhotoRepository photoRepository;
    private final ActorDocumentRepository documentRepository;
    private final UserRepository userRepository;
    private final ActorScope actorScope;

    @Override
    @Transactional(readOnly = true)
    public ActorDetailResponse getDetail(UUID actorId) {
        var actor = actorRepository.findByIdSimple(actorId)
                .orElseThrow(() -> new ActorNotFoundException(actorId));

        int age = actor.getBirthDate() != null
                ? Period.between(actor.getBirthDate(), LocalDate.now()).getYears()
                : 0;

        // Photos
        var photos = photoRepository
                .findByActorIdOrderByIsMainDescCreatedAtDesc(actorId)
                .stream()
                .map(p -> PhotoResponse.builder()
                        .id(p.getId())
                        .url(p.getUrl())
                        .thumbnailUrl(p.getThumbnailUrl())
                        .originalName(p.getOriginalName())
                        .size(p.getSize())
                        .isMain(p.isMain())
                        .createdAt(p.getCreatedAt())
                        .build())
                .toList();

        String mainPhotoUrl = photos.stream()
                .filter(PhotoResponse::isMain)
                .map(PhotoResponse::getUrl)
                .findFirst()
                .orElse(null);

        // Skills
        List<SkillDto> skills = actor.getSkills().stream()
                .map(s -> { var d = new SkillDto(); d.setName(s.getName()); d.setLevel(s.getLevel()); return d; })
                .toList();

        // Languages
        List<LanguageDto> languages = actor.getLanguages().stream()
                .map(l -> { var d = new LanguageDto(); d.setName(l.getName()); d.setLevel(l.getLevel()); return d; })
                .toList();

        // Experiences
        List<ExperienceDto> experiences = actor.getExperiences().stream()
                .map(e -> {
                    var d = new ExperienceDto();
                    d.setTitle(e.getTitle());
                    d.setProduction(e.getProduction());
                    d.setRole(e.getRole());
                    d.setYear(e.getYear());
                    d.setDescription(e.getDescription());
                    return d;
                }).toList();

        // Availabilities
        List<AvailabilityDto> availabilities = actor.getAvailabilities().stream()
                .map(a -> {
                    var d = new AvailabilityDto();
                    d.setFromDate(a.getFromDate());
                    d.setToDate(a.getToDate());
                    d.setNote(a.getNote());
                    return d;
                }).toList();

        // Comments
        var comments = commentRepository
                .findByActorIdOrderByCreatedAtDesc(actorId)
                .stream()
                .map(this::toCommentDto)
                .toList();

        // Documents
        var documents = documentRepository
                .findByActorIdOrderByCreatedAtDesc(actorId)
                .stream()
                .map(this::toDocumentResponse)
                .toList();

        return ActorDetailResponse.builder()
                .id(actor.getId())
                .firstName(actor.getFirstName())
                .lastName(actor.getLastName())
                .birthDate(actor.getBirthDate())
                .age(age > 0 ? age : null)
                .gender(actor.getGender())
                .city(actor.getCity())
                .country(actor.getCountry())
                .phone(actorScope.seesContact(actor) ? actor.getPhone() : null)
                .email(actorScope.seesContact(actor) ? actor.getEmail() : null)
                .contactHidden(!actorScope.seesContact(actor))
                .bio(actor.getBio())
                .height(actor.getHeight())
                .weight(actor.getWeight())
                .eyeColor(actor.getEyeColor())
                .hairColor(actor.getHairColor())
                .mainPhotoUrl(mainPhotoUrl)
                .photos(photos)
                .skills(skills)
                .languages(languages)
                .experiences(experiences)
                .availabilities(availabilities)
                .comments(comments)
                .documents(documents)
                .createdAt(actor.getCreatedAt())
                .updatedAt(actor.getUpdatedAt())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<CommentDto> getComments(UUID actorId) {
        return commentRepository.findByActorIdOrderByCreatedAtDesc(actorId)
                .stream().map(this::toCommentDto).toList();
    }

    @Override
    @Transactional
    public CommentDto addComment(UUID actorId, CommentRequest request, String userEmail) {
        var actor = actorRepository.findById(actorId)
                .orElseThrow(() -> new ActorNotFoundException(actorId));
        var user = userRepository.findByEmail(userEmail).orElse(null);
        var comment = ActorComment.builder()
                .actor(actor).user(user).content(request.getContent()).build();
        return toCommentDto(commentRepository.save(comment));
    }

    @Override
    @Transactional
    public void deleteComment(UUID actorId, UUID commentId) {
        var comment = commentRepository.findByIdAndActorId(commentId, actorId)
                .orElseThrow(() -> new RuntimeException("Comment not found"));
        commentRepository.delete(comment);
    }

    private CommentDto toCommentDto(ActorComment c) {
        String author = c.getUser() != null
                ? c.getUser().getFirstName() + " " + c.getUser().getLastName()
                : "Anonyme";
        return CommentDto.builder()
                .id(c.getId())
                .content(c.getContent())
                .authorName(author)
                .createdAt(c.getCreatedAt())
                .build();
    }

    private DocumentResponse toDocumentResponse(ActorDocument d) {
        return DocumentResponse.builder()
                .id(d.getId())
                .name(d.getName())
                .originalName(d.getOriginalName())
                .type(d.getType())
                .url(d.getUrl())
                .size(d.getSize())
                .createdAt(d.getCreatedAt())
                .build();
    }
}