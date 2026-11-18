package com.castingai.ai;

import com.castingai.ai.dto.*;
import com.castingai.entity.Actor;
import com.castingai.entity.SearchHistory;
import com.castingai.repository.ActorPhotoRepository;
import com.castingai.repository.ActorRepository;
import com.castingai.repository.SearchHistoryRepository;
import com.castingai.repository.UserRepository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.data.domain.Page;
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
    private final com.castingai.service.ActorScope actorScope;
    private final com.castingai.repository.AiFeedbackRepository feedbackRepository;
    private final com.castingai.service.ShortlistService shortlistService;
    private final ObjectMapper objectMapper;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;

    /** T-131 · Vocabulaire du vivier (villes, langues, compétences) pour comprendre la demande ; relu toutes les 10 min. */
    private volatile Vocabulary vocab;
    private record Vocabulary(List<String> cities, List<String> languages, List<String> skills, long at) {}

    private Vocabulary vocabulary() {
        Vocabulary v = vocab;
        if (v != null && System.currentTimeMillis() - v.at() < 600_000) return v;
        java.util.function.Function<String, List<String>> load = sql -> {
            try { return jdbc.queryForList(sql, String.class).stream().filter(x -> x != null && x.trim().length() >= 3)
                    .sorted(Comparator.comparingInt(String::length).reversed()).toList(); }
            catch (Exception e) { return List.of(); }
        };
        v = new Vocabulary(
                load.apply("select min(city) from actors where city is not null group by lower(city) limit 400"),
                load.apply("select min(name) from actor_languages group by lower(name) limit 100"),
                load.apply("select min(name) from actor_skills group by lower(name) limit 300"),
                System.currentTimeMillis());
        vocab = v;
        return v;
    }

    /** Minuscules sans accents, pour comparer « Comédie » et « comedie ». */
    /** Villes de référence (Tunisie d'abord, puis Maghreb et francophonie), du nom le plus long au plus court. */
    private static final List<String> KNOWN_CITIES = java.util.stream.Stream.of(
            "Tunis", "Sfax", "Sousse", "Monastir", "Nabeul", "Bizerte", "Gabès", "Kairouan", "Hammamet", "Djerba", "Ariana", "La Marsa",
            "Carthage", "Mahdia", "Tozeur", "Gafsa", "Le Kef", "Béja", "Jendouba", "Kasserine", "Médenine", "Zarzis", "Tabarka", "Ben Arous",
            "Manouba", "Sidi Bou Saïd", "Hammam-Lif", "Alger", "Oran", "Casablanca", "Rabat", "Marrakech", "Tanger", "Fès", "Tripoli",
            "Paris", "Lyon", "Marseille", "Nice", "Toulouse", "Bordeaux", "Lille", "Nantes", "Strasbourg", "Montpellier", "Rennes",
            "Bruxelles", "Genève", "Montréal", "Rome", "Milan", "Madrid", "Barcelone", "Londres", "Dubaï")
            .sorted(Comparator.comparingInt(String::length).reversed()).toList();

    private static String norm(String s) {
        return java.text.Normalizer.normalize(s == null ? "" : s, java.text.Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
    }

    /** Premier terme du vocabulaire présent comme mot (ou début de mot : « danse » dans « danser ») dans la demande. */
    private static String findTerm(String q, List<String> terms) {
        for (String t : terms) {
            String n = norm(t).trim();
            if (n.length() < 3) continue;
            if (Pattern.compile("(^|[^\\p{L}])" + Pattern.quote(n) + "").matcher(q).find()) return t;
        }
        return null;
    }

    private static final int MAX_CANDIDATES = 12;

    /*
     * Échelle de l'IA (réglable sans recompiler, voir casting.ai dans application.yml) :
     * modèle utilisé, nombre de profils expliqués et longueur maximale de la réponse.
     */
    @Value("${casting.ai.model:llama3.2}")
    private String aiModel;
    @Value("${casting.ai.explain-count:5}")
    private int explainCount;
    @Value("${casting.ai.max-tokens:450}")
    private int maxTokens;

    private static final String SYSTEM_PROMPT = """
        Tu es un expert casting. Classe les acteurs fournis pour la demande du recruteur.

        IMPORTANT : ta réponse commence DIRECTEMENT par [ et finit par ]
        Aucun texte avant ou après : UNIQUEMENT le tableau JSON.
        Sois bref : "raison" en 15 mots maximum, "points_forts" en 8 mots maximum.

        FORMAT :
        [{"id":"uuid-exact","score":85,"raison":"raison courte en français","points_forts":"atouts clés"}]
        """;
    // ─────────────────────────────────────────────────────────
    //  PUBLIC API
    // ─────────────────────────────────────────────────────────

    @Override
    @Transactional
    public SearchResponse search(SearchRequest request, String userEmail) {
        long start = System.currentTimeMillis();
        int size = Math.max(1, Math.min(request.getSize(), 50));
        int page = Math.max(0, request.getPage());
        ParsedCriteria c = parseQuery(request.getQuery());
        com.castingai.service.ActorScope.Scope scope = userRepository.findByEmail(userEmail)
                .map(actorScope::of).orElse(new com.castingai.service.ActorScope.Scope(false, com.castingai.service.ActorScope.NONE));

        // 1. Filtrer et classer dans la base : seuls les identifiants d'une page sont chargés
        Page<UUID> ids = actorRepository.rankedSearch(
                nz(c.getGender()),
                c.getMinAge() == null ? 0 : c.getMinAge(),
                c.getMaxAge() == null ? 150 : c.getMaxAge(),
                nz(c.getLanguage()), nz(c.getSkill()), nz(c.getCity()), nz(c.getHairColor()),
                scope.all(), scope.agency(),
                PageRequest.of(page, size));

        // 2. Charger uniquement les acteurs de la page (sous-tables en lots) et leurs photos principales
        Map<UUID, Actor> byId = new HashMap<>();
        actorRepository.findAllById(ids.getContent()).forEach(a -> byId.put(a.getId(), a));
        Map<UUID, List<String>> photos = new HashMap<>();
        if (!ids.isEmpty()) {
            photoRepository.findByActorIdInOrderByIsMainDescCreatedAtAsc(ids.getContent()).forEach(p ->
                    photos.computeIfAbsent(p.getActor().getId(), k -> new ArrayList<>()).add(p.getUrl()));
        }

        // 3. Score et raisons immédiats (l'explication par l'IA arrive ensuite via /api/ai/explain)
        List<ActorSearchResult> results = ids.getContent().stream()
                .map(byId::get)
                .filter(Objects::nonNull)
                .map(a -> {
                    ActorSearchResult r = buildResultFromCriteria(a, computeScore(a, c), c);
                    List<String> ph = photos.getOrDefault(a.getId(), List.of());
                    r.setPhotoUrls(ph);
                    r.setMainPhotoUrl(ph.isEmpty() ? null : ph.get(0));
                    return r;
                })
                .toList();

        if (page == 0) saveHistory(userEmail, request.getQuery(), (int) ids.getTotalElements());
        log.info("AI Search '{}' -> {} resultats (page {}) en {} ms",
                request.getQuery(), ids.getTotalElements(), page, System.currentTimeMillis() - start);

        return SearchResponse.builder()
                .query(request.getQuery())
                .interpretation(describe(c, ids.getTotalElements()))
                .totalResults((int) ids.getTotalElements())
                .page(page)
                .size(size)
                .hasMore(ids.hasNext())
                .results(results)
                .build();
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private String describe(ParsedCriteria c, long total) {
        List<String> parts = new ArrayList<>();
        if (c.getGender() != null) parts.add(c.getGender());
        if (c.getMinAge() != null) parts.add(Math.max(0, c.getMinAge()) + "–" + c.getMaxAge() + " ans");
        if (c.getLanguage() != null) parts.add("parle " + c.getLanguage());
        if (c.getSkill() != null) parts.add(c.getSkill());
        if (c.getCity() != null) parts.add(c.getCity());
        if (c.getHairColor() != null) parts.add("cheveux " + c.getHairColor().toLowerCase());
        String head = parts.isEmpty() ? "Tous les profils" : "Critères compris : " + String.join(" · ", parts);
        return head + " — " + total + " profil(s) trouvé(s)";
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, String> explain(String query, List<UUID> actorIds) {
        List<UUID> ids = actorIds == null ? List.of() : actorIds.stream().limit(Math.max(1, explainCount)).toList();
        if (ids.isEmpty() || !isOllamaAvailable()) return Map.of();
        List<AiAnalysisResult> ai = callOllama(query, buildProfiles(actorRepository.findAllById(ids)));
        Map<String, String> out = new LinkedHashMap<>();
        for (AiAnalysisResult r : ai) {
            if (r.getId() == null) continue;
            String reason = (r.getRaison() != null ? r.getRaison() : "")
                    + (r.getPoints_forts() != null && !r.getPoints_forts().isBlank() ? ". Atouts : " + r.getPoints_forts() : "");
            out.put(r.getId(), reason);
        }
        return out;
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
                    + "\n\nRetourne le tableau JSON des " + profiles.size() + " acteurs, du meilleur au moins bon.";

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", aiModel);
            body.put("prompt", fullPrompt);
            body.put("stream", false);
            body.put("options", Map.of("temperature", 0.1, "num_predict", maxTokens, "num_ctx", 4096));

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

    /**
     * Lit la réponse du modèle de façon tolérante : on récupère chaque objet {...} séparément,
     * que le modèle ait écrit un seul tableau, plusieurs tableaux ou des objets ligne par ligne.
     */
    private static final Pattern JSON_OBJECT = Pattern.compile("\\{[^{}]*\\}");

    private List<AiAnalysisResult> parseJsonResponse(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        Map<String, AiAnalysisResult> byId = new LinkedHashMap<>();
        Matcher m = JSON_OBJECT.matcher(raw);
        while (m.find()) {
            try {
                AiAnalysisResult r = objectMapper.readValue(m.group(), AiAnalysisResult.class);
                if (r.getId() != null) byId.putIfAbsent(r.getId(), r);
            } catch (Exception e) {
                log.debug("Objet JSON ignoré : {}", e.getMessage());
            }
        }
        if (byId.isEmpty()) {
            log.warn("Aucun profil lisible dans la réponse de l'IA : {}", raw.substring(0, Math.min(300, raw.length())));
        }
        return byId.values().stream()
                .sorted(Comparator.comparingInt(AiAnalysisResult::getScore).reversed())
                .toList();
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

        String nq = norm(query);
        Vocabulary v = vocabulary();
        // Langue, compétence et ville : d'abord le vocabulaire réel du vivier (« Tunis », « Arts martiaux »…)
        String lang = findTerm(nq, v.languages());
        if (lang != null) c.setLanguage(lang);
        else if (q.contains("français") || q.contains("french")) c.setLanguage("Français");
        else if (q.contains("anglais") || q.contains("english")) c.setLanguage("Anglais");
        else if (q.contains("espagnol") || q.contains("spanish")) c.setLanguage("Espagnol");
        else if (q.contains("arabe") || q.contains("arabic")) c.setLanguage("Arabe");
        else if (q.contains("italien") || q.contains("italian")) c.setLanguage("Italien");
        else if (q.contains("allemand") || q.contains("german")) c.setLanguage("Allemand");

        String city = findTerm(nq, v.cities());
        if (city == null) city = findTerm(nq, KNOWN_CITIES);   // ville demandée même si aucune fiche n'y est encore
        if (city != null) c.setCity(city);

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

        String skill = findTerm(nq, v.skills());
        if (skill != null) c.setSkill(skill);
        else if (q.contains("danse")) c.setSkill("Danse");
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
                    .anyMatch(l -> norm(l.getName()).contains(norm(criteria.getLanguage())));
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

        if (criteria.getCity() != null) {
            totalWeight += 15;   // une ville demandée compte, même si la fiche n'en indique pas
            if (actor.getCity() != null && norm(actor.getCity()).contains(norm(criteria.getCity()))) score += 15;
        }

        if (criteria.getSkill() != null) {
            boolean hasSkill = actor.getSkills().stream()
                    .anyMatch(s -> norm(s.getName()).contains(norm(criteria.getSkill())));
            totalWeight += 15;
            if (hasSkill) score += 15;
        }

        if (criteria.getHairColor() != null) {
            totalWeight += 5;
            if (actor.getHairColor() != null && norm(actor.getHairColor()).contains(norm(criteria.getHairColor()))) score += 5;
        }

        if (totalWeight == 0) return 0.5;
        return Math.min(score / totalWeight, 1.0);
    }

    private ActorSearchResult buildResultFromCriteria(
            Actor actor, double score, ParsedCriteria criteria) {
        int age = actor.getBirthDate() != null
                ? Period.between(actor.getBirthDate(), LocalDate.now()).getYears() : 0;

        // T-131 · Chaque critère demandé est montré, rempli ou non : le score ne cache plus ce qui manque
        List<ActorSearchResult.Check> checks = new ArrayList<>();
        if (criteria.getGender() != null) {
            boolean ok = criteria.getGender().equalsIgnoreCase(actor.getGender());
            checks.add(new ActorSearchResult.Check(ok, ok ? criteria.getGender() : "Genre : " + (actor.getGender() == null ? "non renseigné" : actor.getGender())));
        }
        if (criteria.getMinAge() != null || criteria.getMaxAge() != null) {
            String range = (criteria.getMinAge() == null ? "…" : criteria.getMinAge()) + " à " + (criteria.getMaxAge() == null ? "…" : criteria.getMaxAge()) + " ans";
            if (age <= 0) checks.add(new ActorSearchResult.Check(false, "Âge non renseigné"));
            else {
                boolean ok = (criteria.getMinAge() == null || age >= criteria.getMinAge()) && (criteria.getMaxAge() == null || age <= criteria.getMaxAge());
                checks.add(new ActorSearchResult.Check(ok, ok ? age + " ans" : age + " ans (demandé " + range + ")"));
            }
        }
        if (criteria.getCity() != null) {
            boolean ok = actor.getCity() != null && norm(actor.getCity()).contains(norm(criteria.getCity()));
            checks.add(new ActorSearchResult.Check(ok, ok ? actor.getCity()
                    : actor.getCity() == null ? "Ville non renseignée" : actor.getCity() + ", pas " + criteria.getCity()));
        }
        if (criteria.getLanguage() != null) {
            var l = actor.getLanguages().stream().filter(x -> norm(x.getName()).contains(norm(criteria.getLanguage()))).findFirst();
            checks.add(new ActorSearchResult.Check(l.isPresent(), l.map(x -> x.getName() + (x.getLevel() != null ? " (" + x.getLevel().toLowerCase() + ")" : ""))
                    .orElse(criteria.getLanguage() + " non renseigné")));
        }
        if (criteria.getSkill() != null) {
            var k = actor.getSkills().stream().filter(x -> norm(x.getName()).contains(norm(criteria.getSkill()))).findFirst();
            checks.add(new ActorSearchResult.Check(k.isPresent(), k.map(x -> x.getName()).orElse(criteria.getSkill() + " non renseigné")));
        }
        if (criteria.getHairColor() != null) {
            boolean ok = actor.getHairColor() != null && norm(actor.getHairColor()).contains(norm(criteria.getHairColor()));
            checks.add(new ActorSearchResult.Check(ok, ok ? "Cheveux " + actor.getHairColor().toLowerCase() : "Cheveux : " + (actor.getHairColor() == null ? "non renseigné" : actor.getHairColor().toLowerCase())));
        }
        List<String> reasons = checks.stream().map(x -> (x.ok() ? "✓ " : "✗ ") + x.label()).toList();

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
                .checks(checks)
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
                    .bio(actor.getBio() != null && actor.getBio().length() > 160 ? actor.getBio().substring(0, 160) : actor.getBio())
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

    @Override
    @Transactional
    public void feedback(String userEmail, String query, UUID actorId, String decision) {
        feedback(userEmail, query, actorId, decision, null);
    }

    @Override
    @Transactional
    public void feedback(String userEmail, String query, UUID actorId, String decision, UUID roleId) {
        if (!List.of("RETENU", "ECARTE", "ANNULE").contains(decision)) {
            throw new IllegalArgumentException("Décision inconnue : RETENU, ECARTE ou ANNULE");
        }
        Actor actor = actorRepository.findById(actorId)
                .orElseThrow(() -> new IllegalArgumentException("Acteur introuvable"));
        feedbackRepository.save(com.castingai.entity.AiFeedback.builder()
                .user(userRepository.findByEmail(userEmail).orElse(null))
                .actor(actor)
                .query(query == null ? "" : query)
                .decision(decision)
                .roleId(roleId)
                .build());
        if (roleId != null) {
            if ("RETENU".equals(decision)) shortlistService.addFromSwipe(userEmail, roleId, actorId);
            else if ("ANNULE".equals(decision)) shortlistService.undoSwipe(userEmail, roleId, actorId);
        }
    }

    public record HistoryItem(String id, String query, int resultsCount,
                              LocalDateTime createdAt) {}
}