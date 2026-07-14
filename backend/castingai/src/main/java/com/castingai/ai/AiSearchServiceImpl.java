package com.castingai.ai;

import com.castingai.ai.dto.*;
import com.castingai.entity.Actor;
import com.castingai.entity.SearchHistory;
import com.castingai.repository.ActorRepository;
import com.castingai.repository.SearchHistoryRepository;
import com.castingai.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AI Search Service — uses local NLP fallback (no OpenAI required).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiSearchServiceImpl implements AiSearchService {

    private final ActorRepository actorRepository;
    private final SearchHistoryRepository searchHistoryRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional
    public SearchResponse search(SearchRequest request, String userEmail) {
        ParsedCriteria criteria = parseQuery(request.getQuery());
        log.debug("Parsed criteria: {}", criteria);

        // findAll() simple — @Transactional garde la session ouverte
        List<Actor> actors = actorRepository.findAll();

        List<ActorSearchResult> results = scoreAndFilter(actors, criteria);
        saveHistory(userEmail, request.getQuery(), results.size());

        int from = request.getPage() * request.getSize();
        int to = Math.min(from + request.getSize(), results.size());
        List<ActorSearchResult> paged = results.subList(
                Math.min(from, results.size()), to
        );

        return SearchResponse.builder()
                .query(request.getQuery())
                .interpretation(buildInterpretation(criteria))
                .totalResults(results.size())
                .results(paged)
                .build();
    }

    @Override
    public Object getHistory(String userEmail, int limit) {
        return userRepository.findByEmail(userEmail)
                .map(user -> searchHistoryRepository
                        .findByUserIdOrderByCreatedAtDesc(user.getId(), PageRequest.of(0, limit))
                        .stream()
                        .map(h -> new HistoryItem(
                                h.getId().toString(),
                                h.getQuery(),
                                h.getResultsCount(),
                                h.getCreatedAt()))
                        .toList()
                ).orElse(List.of());
    }

    /**
     * Local NLP parser — extracts structured criteria from natural language.
     */
    private ParsedCriteria parseQuery(String query) {
        ParsedCriteria c = new ParsedCriteria();
        String q = query.toLowerCase();

        // Gender
        if (q.contains("femme") || q.contains("woman") ||
                q.contains("comédienne") || q.contains("actrice")) {
            c.setGender("Femme");
        } else if (q.contains("homme") || q.contains("man") ||
                q.contains("comédien") || q.contains("acteur")) {
            c.setGender("Homme");
        }

        // Languages
        if (q.contains("français") || q.contains("french")) c.setLanguage("Français");
        else if (q.contains("anglais") || q.contains("english")) c.setLanguage("Anglais");
        else if (q.contains("espagnol") || q.contains("spanish")) c.setLanguage("Espagnol");
        else if (q.contains("arabe") || q.contains("arabic")) c.setLanguage("Arabe");
        else if (q.contains("italien") || q.contains("italian")) c.setLanguage("Italien");
        else if (q.contains("allemand") || q.contains("german")) c.setLanguage("Allemand");

        // Cities
        if (q.contains("paris")) c.setCity("Paris");
        else if (q.contains("lyon")) c.setCity("Lyon");
        else if (q.contains("marseille")) c.setCity("Marseille");
        else if (q.contains("bordeaux")) c.setCity("Bordeaux");
        else if (q.contains("toulouse")) c.setCity("Toulouse");

        // Age — "entre 25 et 35 ans"
        Matcher rangeMatcher = Pattern.compile("entre (\\d+) et (\\d+)").matcher(q);
        if (rangeMatcher.find()) {
            c.setMinAge(Integer.parseInt(rangeMatcher.group(1)));
            c.setMaxAge(Integer.parseInt(rangeMatcher.group(2)));
        } else {
            Matcher ageMatcher = Pattern.compile("(\\d+)\\s*ans").matcher(q);
            if (ageMatcher.find()) {
                int age = Integer.parseInt(ageMatcher.group(1));
                c.setMinAge(age - 5);
                c.setMaxAge(age + 5);
            }
        }

        // Skills
        if (q.contains("danse") || q.contains("dance")) c.setSkill("Danse");
        else if (q.contains("chant") || q.contains("chanteur") || q.contains("chanteuse")) c.setSkill("Chant");
        else if (q.contains("sport") || q.contains("sportif")) c.setSkill("Sport");
        else if (q.contains("comédie") || q.contains("humour")) c.setSkill("Comédie");
        else if (q.contains("piano")) c.setSkill("Piano");
        else if (q.contains("guitare")) c.setSkill("Guitare");

        // Hair color
        if (q.contains("brun") || q.contains("brune")) c.setHairColor("Brun");
        else if (q.contains("blond") || q.contains("blonde")) c.setHairColor("Blond");
        else if (q.contains("roux") || q.contains("rousse")) c.setHairColor("Roux");
        else if (q.contains("noir") || q.contains("noire")) c.setHairColor("Noir");

        // Eye color
        if (q.contains("yeux bleus") || q.contains("yeux verts") || q.contains("yeux marron")) {
            if (q.contains("bleus")) c.setEyeColor("Bleu");
            else if (q.contains("verts")) c.setEyeColor("Vert");
            else if (q.contains("marron")) c.setEyeColor("Marron");
        }

        log.debug("Parsed: {}", c);
        return c;
    }

    /**
     * Scores and filters actors based on criteria.
     */
    private List<ActorSearchResult> scoreAndFilter(List<Actor> actors, ParsedCriteria criteria) {
        List<ActorSearchResult> results = new ArrayList<>();
        for (Actor actor : actors) {
            double score = computeScore(actor, criteria);
            if (score > 0.1) {
                results.add(buildResult(actor, score, criteria));
            }
        }
        results.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        return results;
    }


    /**
     * Computes a weighted relevance score between 0 and 1.
     * Gender: 40%, Language: 30%, Age: 20%, City: 10%
     */
    private double computeScore(Actor actor, ParsedCriteria criteria) {
        double score = 0.0;
        double totalWeight = 0.0;

        // Gender — weight 40%
        if (criteria.getGender() != null) {
            totalWeight += 40;
            if (criteria.getGender().equalsIgnoreCase(actor.getGender())) {
                score += 40;
            }
        }

        // Language — weight 30%
        if (criteria.getLanguage() != null) {
            totalWeight += 30;
            boolean hasLang = actor.getLanguages().stream()
                    .anyMatch(l -> l.getName().toLowerCase()
                            .contains(criteria.getLanguage().toLowerCase()));
            if (hasLang) score += 30;
        }

        // Age — weight 20%
        if (criteria.getMinAge() != null || criteria.getMaxAge() != null) {
            totalWeight += 20;
            if (actor.getBirthDate() != null) {
                int age = Period.between(actor.getBirthDate(), LocalDate.now()).getYears();
                boolean minOk = criteria.getMinAge() == null || age >= criteria.getMinAge();
                boolean maxOk = criteria.getMaxAge() == null || age <= criteria.getMaxAge();
                if (minOk && maxOk) {
                    score += 20;
                } else {
                    // Partial score if close
                    int diff = 0;
                    if (criteria.getMinAge() != null && age < criteria.getMinAge())
                        diff = criteria.getMinAge() - age;
                    if (criteria.getMaxAge() != null && age > criteria.getMaxAge())
                        diff = age - criteria.getMaxAge();
                    if (diff <= 3) score += 10; // within 3 years
                }
            }
        }

        // City — weight 10%
        if (criteria.getCity() != null && actor.getCity() != null) {
            totalWeight += 10;
            if (actor.getCity().toLowerCase().contains(criteria.getCity().toLowerCase()))
                score += 10;
        }

        // Skill — bonus 15%
        if (criteria.getSkill() != null) {
            boolean hasSkill = actor.getSkills().stream()
                    .anyMatch(s -> s.getName().toLowerCase()
                            .contains(criteria.getSkill().toLowerCase()));
            if (hasSkill) { score += 15; totalWeight += 15; }
            else totalWeight += 15;
        }

        // Hair / Eye color — bonus 5% each
        if (criteria.getHairColor() != null && actor.getHairColor() != null) {
            totalWeight += 5;
            if (actor.getHairColor().toLowerCase()
                    .contains(criteria.getHairColor().toLowerCase())) score += 5;
        }
        if (criteria.getEyeColor() != null && actor.getEyeColor() != null) {
            totalWeight += 5;
            if (actor.getEyeColor().toLowerCase()
                    .contains(criteria.getEyeColor().toLowerCase())) score += 5;
        }

        if (totalWeight == 0) return 0.5; // no criteria = neutral
        return Math.min(score / totalWeight, 1.0);
    }

    private String buildReason(Actor actor, ParsedCriteria criteria) {
        List<String> reasons = new ArrayList<>();

        if (criteria.getGender() != null &&
                criteria.getGender().equalsIgnoreCase(actor.getGender())) {
            reasons.add("✓ Genre correspondant");
        }
        if (criteria.getLanguage() != null) {
            actor.getLanguages().stream()
                    .filter(l -> l.getName().toLowerCase()
                            .contains(criteria.getLanguage().toLowerCase()))
                    .findFirst()
                    .ifPresent(l -> reasons.add("✓ Parle " + l.getName()
                            + (l.getLevel() != null ? " (" + l.getLevel() + ")" : "")));
        }
        if (criteria.getCity() != null && actor.getCity() != null &&
                actor.getCity().toLowerCase().contains(criteria.getCity().toLowerCase())) {
            reasons.add("✓ Basé à " + actor.getCity());
        }
        if (criteria.getSkill() != null) {
            actor.getSkills().stream()
                    .filter(s -> s.getName().toLowerCase()
                            .contains(criteria.getSkill().toLowerCase()))
                    .findFirst()
                    .ifPresent(s -> reasons.add("✓ " + s.getName()
                            + (s.getLevel() != null ? " niveau " + s.getLevel() : "")));
        }
        if (criteria.getMinAge() != null && actor.getBirthDate() != null) {
            int age = Period.between(actor.getBirthDate(), LocalDate.now()).getYears();
            reasons.add("✓ " + age + " ans");
        }

        return reasons.isEmpty() ? "Profil potentiellement compatible"
                : String.join(" · ", reasons);
    }


    private ActorSearchResult buildResult(Actor actor, double score, ParsedCriteria criteria) {
        int age = actor.getBirthDate() != null
                ? Period.between(actor.getBirthDate(), LocalDate.now()).getYears()
                : 0;

        return ActorSearchResult.builder()
                .id(actor.getId())
                .firstName(actor.getFirstName())
                .lastName(actor.getLastName())
                .city(actor.getCity())
                .country(actor.getCountry())
                .gender(actor.getGender())
                .age(age > 0 ? age : null)
                .skills(actor.getSkills().stream().map(s -> s.getName()).toList())
                .languages(actor.getLanguages().stream().map(l -> l.getName()).toList())
                .score(score)
                .reason(buildReason(actor, criteria))
                .build();
    }



    private String buildInterpretation(ParsedCriteria c) {
        List<String> parts = new ArrayList<>();
        if (c.getGender() != null) parts.add(c.getGender());
        if (c.getMinAge() != null && c.getMaxAge() != null)
            parts.add("entre " + c.getMinAge() + " et " + c.getMaxAge() + " ans");
        else if (c.getMinAge() != null) parts.add("+" + c.getMinAge() + " ans");
        else if (c.getMaxAge() != null) parts.add("-" + c.getMaxAge() + " ans");
        if (c.getCity() != null) parts.add("à " + c.getCity());
        if (c.getLanguage() != null) parts.add("parlant " + c.getLanguage());
        if (c.getSkill() != null) parts.add("compétent en " + c.getSkill());
        if (c.getHairColor() != null) parts.add("cheveux " + c.getHairColor());
        return parts.isEmpty() ? "Recherche générale" : String.join(", ", parts);
    }

    private void saveHistory(String email, String query, int count) {
        userRepository.findByEmail(email).ifPresent(user ->
                searchHistoryRepository.save(SearchHistory.builder()
                        .user(user)
                        .query(query)
                        .resultsCount(count)
                        .build())
        );
    }

    public record HistoryItem(String id, String query, int resultsCount,
                              LocalDateTime createdAt) {}
}