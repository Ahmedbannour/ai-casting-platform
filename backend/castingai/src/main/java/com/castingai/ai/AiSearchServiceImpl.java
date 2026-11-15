package com.castingai.ai;

import com.castingai.ai.dto.*;
import com.castingai.entity.Actor;
import com.castingai.entity.SearchHistory;
import com.castingai.repository.ActorPhotoRepository;
import com.castingai.repository.ActorRepository;
import com.castingai.repository.SearchHistoryRepository;
import com.castingai.repository.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * AI Search Service.
 * Primary : Ollama (llama3.2) via HTTP direct.
 * Fallback : local NLP scoring if Ollama unavailable.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiSearchServiceImpl implements AiSearchService {

    private final RestClient ollamaRestClient;
    private final ActorRepository actorRepository;
    private final ActorPhotoRepository photoRepository;
    private final SearchHistoryRepository searchHistoryRepository;
    private final UserRepository userRepository;
    private final ObjectMapper objectMapper;

    private static final String SYSTEM_PROMPT = """
        Tu es un expert casting. Analyse les acteurs et retourne les 5 meilleurs.
        
        IMPORTANT : Ta réponse doit commencer DIRECTEMENT par [ et finir par ]
        N'écris RIEN avant le [ et RIEN après le ]
        Pas d'explication, pas de texte, UNIQUEMENT le tableau JSON.
        
        FORMAT :
        [{"id":"uuid-exact","score":85,"raison":"raison en français","points_forts":"points positifs","points_faibles":"points négatifs"}]
        """;
    // ─────────────────────────────────────────────────────────
    //  PUBLIC API
    // ─────────────────────────────────────────────────────────

    @Override
    @Transactional
    public SearchResponse search(SearchRequest request, String userEmail) {
        log.info("AI Search — query: {}", request.getQuery());

        List<Actor> actors = actorRepository.findAll();

        if (actors.isEmpty()) {
            saveHistory(userEmail, request.getQuery(), 0);
            return SearchResponse.builder()
                    .query(request.getQuery())
                    .interpretation("Aucun acteur dans la base de données")
                    .totalResults(0)
                    .results(List.of())
                    .build();
        }

        // Build profiles
        List<ActorProfile> profiles = buildProfiles(actors);

        // Try Ollama first, fallback to local NLP
        List<ActorSearchResult> results;
        if (isOllamaAvailable()) {
            log.info("Using Ollama (llama3.2) for AI scoring");
            results = searchWithOllama(request.getQuery(), actors, profiles);
        } else {
            log.warn("Ollama unavailable — using local NLP fallback");
            results = searchWithFallback(request.getQuery(), actors);
        }

        saveHistory(userEmail, request.getQuery(), results.size());

        // Paginate
        int from = request.getPage() * request.getSize();
        int to = Math.min(from + request.getSize(), results.size());
        List<ActorSearchResult> paged = results.subList(
                Math.min(from, results.size()), to
        );

        return SearchResponse.builder()
                .query(request.getQuery())
                .interpretation("Analyse IA : \"" + request.getQuery() + "\" — "
                        + results.size() + " résultat(s)")
                .totalResults(results.size())
                .results(paged)
                .build();
    }

    @Override
    public Object getHistory(String userEmail, int limit) {
        return userRepository.findByEmail(userEmail)
                .map(user -> searchHistoryRepository
                        .findByUserIdOrderByCreatedAtDesc(
                                user.getId(), PageRequest.of(0, limit))
                        .stream()
                        .map(h -> new HistoryItem(
                                h.getId().toString(),
                                h.getQuery(),
                                h.getResultsCount(),
                                h.getCreatedAt()))
                        .toList()
                ).orElse(List.of());
    }

    // ─────────────────────────────────────────────────────────
    //  OLLAMA PIPELINE
    // ─────────────────────────────────────────────────────────

    private boolean isOllamaAvailable() {
        try {
            ollamaRestClient.get()
                    .uri("/api/tags")
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (Exception e) {
            log.warn("Ollama not available: {}", e.getMessage());
            return false;
        }
    }

    private List<ActorSearchResult> searchWithOllama(
            String query, List<Actor> actors, List<ActorProfile> profiles) {
        try {
            List<AiAnalysisResult> aiResults = callOllama(query, profiles);

            Map<String, Actor> actorMap = new HashMap<>();
            for (Actor a : actors) actorMap.put(a.getId().toString(), a);

            return aiResults.stream()
                    .filter(r -> actorMap.containsKey(r.getId()))
                    .map(r -> buildResultFromAi(actorMap.get(r.getId()), r))
                    .toList();

        } catch (Exception e) {
            log.error("Ollama pipeline failed: {}", e.getMessage());
            return searchWithFallback(query, actors);
        }
    }

    private List<AiAnalysisResult> callOllama(String query, List<ActorProfile> profiles) {
        try {
            String profilesJson = objectMapper.writeValueAsString(profiles);

            String fullPrompt = SYSTEM_PROMPT
                    + "\n\nACTEURS DISPONIBLES (JSON) :\n" + profilesJson
                    + "\n\nDEMANDE DU RECRUTEUR : \"" + query + "\""
                    + "\n\nRetourne le tableau JSON des 5 meilleurs acteurs.";

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", "llama3.2");
            body.put("prompt", fullPrompt);
            body.put("stream", false);
            body.put("options", Map.of("temperature", 0.1, "num_predict", 1024));

            log.debug("Calling Ollama with {} actors...", profiles.size());

            Map<String, Object> response = ollamaRestClient.post()
                    .uri("/api/generate")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(new ParameterizedTypeReference<Map<String, Object>>() {});

            if (response == null || !response.containsKey("response")) {
                log.warn("Empty Ollama response");
                return List.of();
            }

            String rawText = (String) response.get("response");
            log.debug("Ollama response: {}", rawText);
            return parseJsonResponse(rawText);

        } catch (Exception e) {
            log.error("callOllama error: {}", e.getMessage());
            return List.of();
        }
    }

    private List<AiAnalysisResult> parseJsonResponse(String raw) {
        try {
            if (raw == null || raw.isBlank()) return List.of();

            String cleaned = raw.trim()
                    .replaceAll("(?s)```json\\s*", "")
                    .replaceAll("```", "")
                    .replaceAll("(?s)^[^\\[]*", "")  // supprime tout avant [
                    .trim();

            int start = cleaned.indexOf('[');
            int end   = cleaned.lastIndexOf(']');

            if (start == -1 || end == -1 || end <= start) {
                log.warn("No JSON array found. Raw: {}", raw.substring(0, Math.min(500, raw.length())));
                return List.of();
            }

            String jsonArray = cleaned.substring(start, end + 1);
            log.debug("Parsed JSON array: {}", jsonArray.substring(0, Math.min(300, jsonArray.length())));

            List<AiAnalysisResult> list = objectMapper.readValue(
                    jsonArray, new TypeReference<List<AiAnalysisResult>>() {}
            );

            return list.stream()
                    .sorted(Comparator.comparingInt(AiAnalysisResult::getScore).reversed())
                    .limit(5)
                    .toList();

        } catch (Exception e) {
            log.error("JSON parse error: {} | raw: >>{}<<", e.getMessage(),
                    raw.substring(0, Math.min(1000, raw.length())));
            return List.of();
        }
    }

    private ActorSearchResult buildResultFromAi(Actor actor, AiAnalysisResult ai) {
        int age = actor.getBirthDate() != null
                ? Period.between(actor.getBirthDate(), LocalDate.now()).getYears() : 0;

        String mainPhoto = photoRepository
                .findByActorIdOrderByIsMainDescCreatedAtDesc(actor.getId())
                .stream().filter(p -> p.isMain()).map(p -> p.getUrl())
                .findFirst().orElse(null);

        String reason = (ai.getRaison() != null ? ai.getRaison() : "")
                + (ai.getPoints_forts() != null && !ai.getPoints_forts().isBlank()
                ? " | ✓ " + ai.getPoints_forts() : "");

        return ActorSearchResult.builder()
                .id(actor.getId())
                .firstName(actor.getFirstName())
                .lastName(actor.getLastName())
                .city(actor.getCity())
                .country(actor.getCountry())
                .gender(actor.getGender())
                .age(age > 0 ? age : null)
                .mainPhotoUrl(mainPhoto)
                .skills(actor.getSkills().stream().map(s -> s.getName()).toList())
                .languages(actor.getLanguages().stream().map(l -> l.getName()).toList())
                .score(Math.min(ai.getScore() / 100.0, 1.0))
                .reason(reason)
                .build();
    }

    // ─────────────────────────────────────────────────────────
    //  LOCAL NLP FALLBACK
    // ─────────────────────────────────────────────────────────

    private List<ActorSearchResult> searchWithFallback(String query, List<Actor> actors) {
        ParsedCriteria criteria = parseQuery(query);
        log.debug("Fallback criteria: {}", criteria);

        List<ActorSearchResult> results = new ArrayList<>();
        for (Actor actor : actors) {
            double score = computeScore(actor, criteria);
            if (score > 0.1) {
                results.add(buildResultFromCriteria(actor, score, criteria));
            }
        }

        results.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        return results.stream().limit(5).toList();
    }

    private ParsedCriteria parseQuery(String query) {
        ParsedCriteria c = new ParsedCriteria();
        String q = query.toLowerCase();

        if (q.contains("femme") || q.contains("woman") ||
                q.contains("comédienne") || q.contains("actrice")) c.setGender("Femme");
        else if (q.contains("homme") || q.contains("man") ||
                q.contains("comédien") || q.contains("acteur")) c.setGender("Homme");

        if (q.contains("français") || q.contains("french")) c.setLanguage("Français");
        else if (q.contains("anglais") || q.contains("english")) c.setLanguage("Anglais");
        else if (q.contains("espagnol") || q.contains("spanish")) c.setLanguage("Espagnol");
        else if (q.contains("arabe") || q.contains("arabic")) c.setLanguage("Arabe");
        else if (q.contains("italien") || q.contains("italian")) c.setLanguage("Italien");
        else if (q.contains("allemand") || q.contains("german")) c.setLanguage("Allemand");

        if (q.contains("paris")) c.setCity("Paris");
        else if (q.contains("lyon")) c.setCity("Lyon");
        else if (q.contains("marseille")) c.setCity("Marseille");

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

        if (q.contains("danse")) c.setSkill("Danse");
        else if (q.contains("chant")) c.setSkill("Chant");
        else if (q.contains("comédie")) c.setSkill("Comédie");
        else if (q.contains("sport")) c.setSkill("Sport");

        if (q.contains("brun")) c.setHairColor("Brun");
        else if (q.contains("blond")) c.setHairColor("Blond");
        else if (q.contains("roux")) c.setHairColor("Roux");

        return c;
    }

    private double computeScore(Actor actor, ParsedCriteria criteria) {
        double score = 0.0;
        double totalWeight = 0.0;

        if (criteria.getGender() != null) {
            totalWeight += 40;
            if (criteria.getGender().equalsIgnoreCase(actor.getGender())) score += 40;
        }

        if (criteria.getLanguage() != null) {
            totalWeight += 30;
            boolean hasLang = actor.getLanguages().stream()
                    .anyMatch(l -> l.getName().toLowerCase()
                            .contains(criteria.getLanguage().toLowerCase()));
            if (hasLang) score += 30;
        }

        if (criteria.getMinAge() != null || criteria.getMaxAge() != null) {
            totalWeight += 20;
            if (actor.getBirthDate() != null) {
                int age = Period.between(actor.getBirthDate(), LocalDate.now()).getYears();
                boolean minOk = criteria.getMinAge() == null || age >= criteria.getMinAge();
                boolean maxOk = criteria.getMaxAge() == null || age <= criteria.getMaxAge();
                if (minOk && maxOk) score += 20;
                else {
                    int diff = 0;
                    if (criteria.getMinAge() != null && age < criteria.getMinAge())
                        diff = criteria.getMinAge() - age;
                    if (criteria.getMaxAge() != null && age > criteria.getMaxAge())
                        diff = age - criteria.getMaxAge();
                    if (diff <= 3) score += 10;
                }
            }
        }

        if (criteria.getCity() != null && actor.getCity() != null) {
            totalWeight += 10;
            if (actor.getCity().toLowerCase().contains(criteria.getCity().toLowerCase()))
                score += 10;
        }

        if (criteria.getSkill() != null) {
            boolean hasSkill = actor.getSkills().stream()
                    .anyMatch(s -> s.getName().toLowerCase()
                            .contains(criteria.getSkill().toLowerCase()));
            totalWeight += 15;
            if (hasSkill) score += 15;
        }

        if (criteria.getHairColor() != null && actor.getHairColor() != null) {
            totalWeight += 5;
            if (actor.getHairColor().toLowerCase()
                    .contains(criteria.getHairColor().toLowerCase())) score += 5;
        }

        if (totalWeight == 0) return 0.5;
        return Math.min(score / totalWeight, 1.0);
    }

    private ActorSearchResult buildResultFromCriteria(
            Actor actor, double score, ParsedCriteria criteria) {
        int age = actor.getBirthDate() != null
                ? Period.between(actor.getBirthDate(), LocalDate.now()).getYears() : 0;

        List<String> reasons = new ArrayList<>();
        if (criteria.getGender() != null &&
                criteria.getGender().equalsIgnoreCase(actor.getGender()))
            reasons.add("✓ Genre correspondant");
        if (criteria.getLanguage() != null)
            actor.getLanguages().stream()
                    .filter(l -> l.getName().toLowerCase()
                            .contains(criteria.getLanguage().toLowerCase()))
                    .findFirst()
                    .ifPresent(l -> reasons.add("✓ Parle " + l.getName()
                            + (l.getLevel() != null ? " (" + l.getLevel() + ")" : "")));
        if (criteria.getCity() != null && actor.getCity() != null &&
                actor.getCity().toLowerCase().contains(criteria.getCity().toLowerCase()))
            reasons.add("✓ Basé à " + actor.getCity());
        if (criteria.getSkill() != null)
            actor.getSkills().stream()
                    .filter(s -> s.getName().toLowerCase()
                            .contains(criteria.getSkill().toLowerCase()))
                    .findFirst()
                    .ifPresent(s -> reasons.add("✓ " + s.getName()));
        if (criteria.getMinAge() != null && actor.getBirthDate() != null) {
            int actorAge = Period.between(actor.getBirthDate(), LocalDate.now()).getYears();
            reasons.add("✓ " + actorAge + " ans");
        }

        return ActorSearchResult.builder()
                .id(actor.getId())
                .firstName(actor.getFirstName())
                .lastName(actor.getLastName())
                .city(actor.getCity())
                .country(actor.getCountry())
                .gender(actor.getGender())
                .age(age > 0 ? age : null)
                .mainPhotoUrl(null)
                .skills(actor.getSkills().stream().map(s -> s.getName()).toList())
                .languages(actor.getLanguages().stream().map(l -> l.getName()).toList())
                .score(score)
                .reason(reasons.isEmpty() ? "Profil potentiellement compatible"
                        : String.join(" · ", reasons))
                .build();
    }

    // ─────────────────────────────────────────────────────────
    //  UTILS
    // ─────────────────────────────────────────────────────────

    private List<ActorProfile> buildProfiles(List<Actor> actors) {
        return actors.stream().map(actor -> {
            int age = actor.getBirthDate() != null
                    ? Period.between(actor.getBirthDate(), LocalDate.now()).getYears() : 0;

            return ActorProfile.builder()
                    .id(actor.getId().toString())
                    .firstName(actor.getFirstName())
                    .lastName(actor.getLastName())
                    .age(age > 0 ? age : null)
                    .gender(actor.getGender())
                    .city(actor.getCity())
                    .country(actor.getCountry())
                    .bio(actor.getBio())
                    .height(actor.getHeight())
                    .eyeColor(actor.getEyeColor())
                    .hairColor(actor.getHairColor())
                    .languages(actor.getLanguages().stream()
                            .map(l -> l.getName()
                                    + (l.getLevel() != null ? " (" + l.getLevel() + ")" : ""))
                            .toList())
                    .skills(actor.getSkills().stream()
                            .map(s -> s.getName()
                                    + (s.getLevel() != null ? " - " + s.getLevel() : ""))
                            .toList())
                    .experiences(actor.getExperiences().stream()
                            .map(e -> e.getTitle()
                                    + (e.getProduction() != null ? " / " + e.getProduction() : "")
                                    + (e.getYear() != null ? " (" + e.getYear() + ")" : ""))
                            .toList())
                    .build();
        }).toList();
    }

    private void saveHistory(String email, String query, int count) {
        userRepository.findByEmail(email).ifPresent(user ->
                searchHistoryRepository.save(SearchHistory.builder()
                        .user(user).query(query).resultsCount(count).build())
        );
    }

    public record HistoryItem(String id, String query, int resultsCount,
                              LocalDateTime createdAt) {}
}