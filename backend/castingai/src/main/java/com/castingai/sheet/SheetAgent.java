package com.castingai.sheet;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.util.*;
import java.util.function.Consumer;

/**
 * P-087 · L'agent qui lit un document de projet (brief, recommandation, présentation) et remplit la fiche.
 *
 * Méthode :
 *  1. le texte complet est découpé par pages ou diapositives, en morceaux d'environ 3 500 caractères ;
 *  2. pour chaque morceau, l'IA locale (qwen2.5:3b par défaut, entièrement sur la carte graphique) relève les informations de chaque champ ;
 *     chaque valeur est ensuite vérifiée contre le texte : consigne recopiée, réponse vague, nombre inventé ou mots absents du document → écartée ;
 *  3. les relevés des morceaux sont fusionnés (listes réunies, textes synthétisés par l'IA) ;
 *  4. les dates sont normalisées. Les étiquettes simples (« Cible : … ») sont toujours lues, même sans IA.
 *
 * Gratuit, rien ne sort de la machine. Si le grand modèle manque, l'agent se replie sur le modèle de base.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SheetAgent {

    private final ObjectMapper json;

    @Value("${casting.ai.sheet-model:qwen2.5:3b}")
    private String sheetModel;
    @Value("${casting.ai.draft-model:qwen2.5:3b}")
    private String draftModel;
    @Value("${casting.ai.model:llama3.2}")
    private String baseModel;
    @Value("${spring.ai.ollama.base-url:http://localhost:11434}")
    private String ollamaUrl;
    @Value("${casting.ai.sheet-timeout-seconds:300}")
    private int timeoutSeconds;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    static final int CHUNK = 3500;
    static final int MAX_CHUNKS = 12;
    /** Champs à plusieurs valeurs : on réunit ce que disent les différentes pages. */
    static final Set<String> LISTS = Set.of("ton", "supports", "lieux", "references", "contraintes", "duree", "format");
    /** Champs que l'agent ne remplit pas depuis un document (structurés ailleurs dans la fiche). */
    static final Set<String> SKIP = Set.of("planning");

    // ───────── Lecture d'un document ─────────

    public SheetAi.Extraction extract(String text, Consumer<String> progress) {
        Map<String, String> out = new LinkedHashMap<>(SheetAi.rules(text));
        out.keySet().removeAll(SKIP);
        List<String> chunks = chunks(text);
        String doc = " " + plain(text) + " ";
        Map<String, List<String>> found = new LinkedHashMap<>();
        String engine = "IA";
        int ok = 0, kept = 0, dropped = 0;
        int calls = chunks.size() * GROUPS.size();
        for (int c = 0; c < calls; c++) {
            int i = c / GROUPS.size();
            if (progress != null) progress.accept("L'IA lit le document : partie " + (i + 1) + " sur " + chunks.size() + (c % 2 == 0 ? " (le brief)…" : " (la création)…"));
            Map<?, ?> res = ask(sheetModel, chunkPrompt(chunks.get(i), i + 1, chunks.size(), GROUPS.get(c % GROUPS.size())), 700, 0.1);
            if (res == null) { if (ok == 0 && c == 0) { engine = "REGLES"; break; } continue; }
            ok++;
            // Le petit modèle rend tantôt {"champs": {…}}, tantôt les champs à plat, tantôt {cle: {valeur, citation}} : tout est accepté.
            Map<?, ?> m = res.get("champs") instanceof Map<?, ?> cm ? cm : res;
            List<String> keptHere = new ArrayList<>(), droppedHere = new ArrayList<>();
            for (var e : m.entrySet()) {
                String k = String.valueOf(e.getKey());
                SheetSchema.Field f = SheetSchema.BY_KEY.get(k);
                if (f == null || SKIP.contains(k)) continue;
                String value = e.getValue() instanceof Map<?, ?> v ? str(v.get("valeur")) : e.getValue() instanceof List<?> l ? String.join(", ", l.stream().map(String::valueOf).toList()) : str(e.getValue());
                if (value == null || value.isBlank()) continue;
                String val = clean(k, value, doc);
                if (val == null) { dropped++; droppedHere.add(k + "=" + cut(value, 60)); continue; }
                val = SheetAi.normalize(k, val);
                if (val == null) { dropped++; continue; }
                kept++; keptHere.add(k);
                found.computeIfAbsent(k, x -> new ArrayList<>()).add(val);
            }
            log.info("Agent, partie {}/{} ({}) : gardés {} · écartés {}", i + 1, chunks.size(), c % 2 == 0 ? "brief" : "création", keptHere, droppedHere);
        }
        // Ce que le document dit en toutes lettres, même si l'IA l'a manqué
        keywords(doc).forEach((k, v) -> found.computeIfAbsent(k, x -> new ArrayList<>()).add(v));
        // La signature en couverture, entre guillemets (« Ma 3andi 7atta fekra »), passe avant les accroches trouvées plus loin
        if (!chunks.isEmpty()) {
            java.util.regex.Matcher q = java.util.regex.Pattern.compile("[«“\"]\\s*([^»”\"\\n]{4,70}?)\\s*[»”\"]").matcher(chunks.get(0).substring(0, Math.min(800, chunks.get(0).length())));
            if (q.find()) found.computeIfAbsent("accroche", x -> new ArrayList<>()).add(0, q.group(1).strip());
        }
        if (!found.isEmpty()) {
            if (progress != null) progress.accept("L'IA met les informations au propre…");
            Map<String, String> merged = merge(found, doc);
            for (var e : merged.entrySet()) out.putIfAbsent(e.getKey(), e.getValue());
            // L'IA prime sur les règles quand elle a trouvé plus précis pour un champ court
            for (var e : merged.entrySet()) if (!out.get(e.getKey()).equals(e.getValue()) && e.getValue().length() > out.get(e.getKey()).length() && e.getValue().length() < 600)
                out.put(e.getKey(), e.getValue());
        }
        log.info("Agent de la fiche : {} morceau(x), {} lu(s) par l'IA, {} relevé(s) gardé(s), {} écarté(s), {} champ(s) remplis", chunks.size(), ok, kept, dropped, out.size());
        return new SheetAi.Extraction(out, ok > 0 ? "IA" : engine);
    }

    /** Pages ou diapositives regroupées en morceaux d'environ 3 500 caractères. */
    static List<String> chunks(String text) {
        List<String> pages = new ArrayList<>();
        for (String p : text.split("\\f")) { String t = p.trim(); if (t.length() > 2) pages.add(t); }
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        for (String p : pages) {
            if (p.length() > CHUNK) {   // une très longue page (document Word) : on la coupe aux paragraphes
                for (String para : p.split("\\n\\n")) {
                    if (cur.length() + para.length() > CHUNK && cur.length() > 0) { out.add(cur.toString()); cur.setLength(0); }
                    cur.append(para.length() > CHUNK ? para.substring(0, CHUNK) : para).append("\n\n");
                }
                continue;
            }
            if (cur.length() + p.length() > CHUNK && cur.length() > 0) { out.add(cur.toString()); cur.setLength(0); }
            cur.append(p).append("\n\n");
        }
        if (cur.length() > 0) out.add(cur.toString());
        return out.size() > MAX_CHUNKS ? out.subList(0, MAX_CHUNKS) : out;
    }

    /**
     * Deux lectures par morceau, chacune sur la moitié des champs : un petit modèle répond bien mieux à dix questions qu'à vingt.
     * La lecture « brief » (marque, diffusion, production), puis la lecture « création » (idée, réalisation). Ton et lieux sont dans les deux.
     */
    static final List<Set<String>> GROUPS = List.of(
            Set.of("titre", "produit", "objectif", "cible", "message", "ton", "contraintes", "diffusion", "duree", "supports", "accroche", "lieux", "dates_tournage"),
            Set.of("idee", "deroule", "references", "intention", "image", "rythme", "format", "ton", "lieux", "accroche"));

    static String chunkPrompt(String chunk, int n, int total) { return chunkPrompt(chunk, n, total, null); }

    static String chunkPrompt(String chunk, int n, int total, Set<String> only) {
        StringBuilder sb = new StringBuilder("""
            Tu lis l'extrait %d/%d d'un document de projet publicitaire (brief, recommandation d'agence, proposition de réalisation, note d'intention…).
            Ta tâche : remplir les champs d'une fiche de projet avec ce que DIT cet extrait.

            Champs possibles :
            """.formatted(n, total));
        for (SheetSchema.Field f : SheetSchema.FIELDS) {
            if (SKIP.contains(f.key()) || (only != null && !only.contains(f.key()))) continue;
            sb.append("- \"").append(f.key()).append("\" : ").append(f.label()).append(" — ").append(f.hint()).append('\n');
        }
        sb.append("""

            Règles :
            - Remplis tout champ dont l'extrait parle, même indirectement (un concept décrit = "idee", une liste de décors = "lieux", un ton décrit = "ton"…).
            - "valeur" : une réponse courte et claire en français, avec les vrais noms, lieux, durées et dates du document (1 à 3 phrases, ou une liste séparée par des virgules).
            - "citation" : quelques mots copiés EXACTEMENT de l'extrait qui prouvent la valeur.
            - Ne recopie jamais la description d'un champ. N'invente rien. Ignore les champs dont l'extrait ne parle pas.
            - Pas de budget, de prix ni de coordonnées personnelles.

            Réponds uniquement en JSON : {"champs": {"cle": {"valeur": "...", "citation": "..."}}}

            EXTRAIT :
            \"\"\"
            """);
        sb.append(chunk).append("\n\"\"\"");
        return sb.toString();
    }

    private static final Set<String> STOP = Set.of(("avec dans pour plus sans sous leur leurs cette ces elle elles nous vous ils une des les est sont qui que quoi dont entre chaque "
            + "tout tous toute toutes faire fait comme mais aussi tres bien film films projet serie series episode episodes publicite").split(" "));
    private static final List<String> VAGUE = List.of("a venir", "a definir", "non mentionne", "non specifie", "non precise", "non communique", "inconnu", "aucun", "aucune",
            "public general", "grand public", "tout public", "n a");
    /** Un support de diffusion ressemble à un média (et pas à un décor que le modèle aurait rangé là). */
    static final java.util.regex.Pattern MEDIA = java.util.regex.Pattern.compile("(tele|\\btv\\b|cinema|digital|web|reseau|social|instagram|facebook|tiktok|youtube|snap|linkedin|affich|radio|presse|ooh|ecran|vod|replay|site|display|influen|stor|reel|ligne|mobile|streaming)");
    /** Champs qui demandent de vraies phrases (pas un titre d'épisode). */
    static final Set<String> SENTENCES = Set.of("idee", "deroule", "intention");
    /** Champs à une seule valeur : la première page qui en parle (souvent la couverture ou le sommaire) l'emporte. */
    static final Set<String> FIRST = Set.of("titre", "produit", "accroche", "message", "objectif", "cible", "diffusion", "dates_tournage", "idee");

    private static List<String> words(String s) {
        List<String> w = new ArrayList<>();
        for (String x : plain(s).trim().split(" ")) if ((x.length() >= 4 || x.matches("\\d+")) && !STOP.contains(x)) w.add(x);
        return w;
    }

    /**
     * Garde une valeur seulement si le document la porte vraiment : ni consigne recopiée, ni réponse vague, chaque nombre présent dans le document,
     * et au moins 60 % de ses mots significatifs retrouvés dans le texte. Les listes sont vérifiées élément par élément.
     */
    static String clean(String key, String value, String doc) {
        String v = value.strip().replaceAll("\\s+", " ");
        if (key.equals("dates_tournage") && SheetAi.range(v) == null) return null;   // « Jour 1 : salle de réunion » n'est pas une date
        if (LISTS.contains(key)) {
            LinkedHashMap<String, String> items = new LinkedHashMap<>();
            for (String it : v.split("\\s*[,;\\n]\\s*|\\s+et\\s+")) { String t = it.trim().replaceAll("^[(«\"'\\s]+|[).»\"'\\s]+$", ""); if (t.length() > 1 && grounded(key, t, doc) && (!key.equals("supports") || MEDIA.matcher(plain(t)).find())) items.putIfAbsent(plain(t).trim(), t); }
            return items.isEmpty() ? null : cut(String.join(", ", items.values()), 600);
        }
        // une phrase répétée en boucle par le modèle : on garde la première occurrence
        v = unloop(v);
        if (SENTENCES.contains(key) && words(v).size() < 5) return null;   // « La tache qui parle » n'est pas une note d'intention
        return grounded(key, v, doc) ? cut(v, 900) : null;
    }

    /** Les morceaux de phrase déjà dits (séparés par virgule ou point) ne sont gardés qu'une fois. */
    static String unloop(String v) {
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        StringBuilder sb = new StringBuilder();
        for (String part : v.split("(?<=[,.;])\\s+")) {
            String k = plain(part).trim();
            if (k.isEmpty() || !seen.add(k)) continue;
            sb.append(sb.length() > 0 ? " " : "").append(part);
        }
        return sb.toString().replaceAll("[,;]\\s*$", "");
    }

    static boolean grounded(String key, String value, String doc) {
        String p = plain(value).trim();
        if (p.isEmpty()) return false;
        for (String x : VAGUE) if (p.equals(x) || p.startsWith(x + " ")) return false;
        if (value.matches("\\d{4}-\\d{2}-\\d{2}(/\\d{4}-\\d{2}-\\d{2})?.*")) return true;   // date normalisée : vérifiée par normalize
        SheetSchema.Field f = SheetSchema.BY_KEY.get(key);
        Set<String> hint = f == null ? Set.of() : new HashSet<>(words(f.label() + " " + f.hint()));
        List<String> w = words(value);
        if (w.isEmpty()) return false;
        long echo = w.stream().filter(hint::contains).count();
        if (echo * 2 >= w.size()) return false;                                        // la consigne recopiée
        for (String x : p.split(" ")) if (x.matches("\\d+") && !doc.contains(" " + x + " ")) return false;   // un nombre inventé
        long hit = w.stream().filter(x -> doc.contains(" " + x)).count();
        return hit * 10 >= w.size() * 6L;
    }

    /** Supports et formats écrits en toutes lettres dans le document. */
    static Map<String, String> keywords(String doc) {
        Map<String, String> out = new LinkedHashMap<>();
        List<String> sup = new ArrayList<>();
        if (doc.matches(".* (serie digitale|digital|digitale|web|en ligne) .*")) sup.add("Digital");
        if (doc.matches(".* (reseaux sociaux|social media) .*")) sup.add("Réseaux sociaux");
        for (String[] s : new String[][]{{"instagram", "Instagram"}, {"facebook", "Facebook"}, {"tiktok", "TikTok"}, {"youtube", "YouTube"}})
            if (doc.contains(" " + s[0] + " ") && !sup.contains(s[1])) sup.add(s[1]);
        // Des mots courants (« cinéma », « TV ») ne comptent que près d'un mot de la diffusion : un personnage « Cinéma » n'est pas un support
        String near = "(diffusion|diffuse|supports?|medias?|campagne|spot|plan media)";
        for (String[] s : new String[][]{{"television|tv", "Télévision"}, {"cinema", "Cinéma"}, {"affichage", "Affichage"}, {"radio", "Radio"}})
            if (java.util.regex.Pattern.compile(" " + near + "( \\S+){0,8} (" + s[0] + ") | (" + s[0] + ")( \\S+){0,8} " + near + " ").matcher(doc).find() && !sup.contains(s[1])) sup.add(s[1]);
        if (!sup.isEmpty()) out.put("supports", String.join(", ", sup));
        List<String> fmt = new ArrayList<>();
        if (doc.contains(" 16 9 ")) fmt.add("16:9");
        if (doc.contains(" 9 16 ") || doc.contains(" vertical ")) fmt.add("Vertical 9:16");
        if (doc.contains(" 1 1 ") && doc.contains(" carre ")) fmt.add("Carré 1:1");
        if (doc.contains(" 4 5 ")) fmt.add("4:5");
        if (!fmt.isEmpty()) out.put("format", String.join(", ", fmt));
        return out;
    }

    /** Une valeur par champ : les listes sont réunies, les textes trouvés sur plusieurs pages sont synthétisés. */
    Map<String, String> merge(Map<String, List<String>> found, String doc) {
        Map<String, String> out = new LinkedHashMap<>();
        Map<String, List<String>> toSynth = new LinkedHashMap<>();
        for (var e : found.entrySet()) {
            List<String> vals = dedupe(e.getValue());
            if (vals.size() == 1 || FIRST.contains(e.getKey())) out.put(e.getKey(), vals.get(0));
            else if (LISTS.contains(e.getKey())) out.put(e.getKey(), joinList(e.getKey(), vals));
            else toSynth.put(e.getKey(), vals);
        }
        if (!toSynth.isEmpty()) {
            StringBuilder sb = new StringBuilder("""
                Pour chaque champ de la fiche d'un projet publicitaire, plusieurs pages d'un même document ont donné des propositions.
                La première proposition vient du début du document (vue d'ensemble) ; les suivantes, des pages de détail.
                Fusionne-les en UNE valeur claire en français qui décrit le projet entier, sans rien ajouter qui ne soit dans les propositions, au plus 450 caractères.
                Réponds UNIQUEMENT par un objet JSON : {"champs": {"cle": "valeur"}}

                """);
            for (var e : toSynth.entrySet()) {
                SheetSchema.Field f = SheetSchema.BY_KEY.get(e.getKey());
                sb.append("Champ \"").append(e.getKey()).append("\" (").append(f.label()).append(") :\n");
                for (String v : e.getValue()) sb.append("  - ").append(v).append('\n');
            }
            Map<?, ?> res = ask(sheetModel, sb.toString(), 900, 0.1);
            Map<?, ?> champs = res != null && res.get("champs") instanceof Map<?, ?> m ? m : Map.of();
            for (var e : toSynth.entrySet()) {
                String v = str(champs.get(e.getKey()));
                String n = v == null || !grounded(e.getKey(), v, doc) ? null : SheetAi.normalize(e.getKey(), cut(v.strip(), 900));
                out.put(e.getKey(), n != null ? n : e.getValue().get(0));
            }
        }
        return out;
    }

    private static List<String> dedupe(List<String> vals) {
        List<String> out = new ArrayList<>();
        outer:
        for (String v : vals) {
            String pv = plain(v);
            for (int i = 0; i < out.size(); i++) {
                String po = plain(out.get(i));
                if (po.contains(pv)) continue outer;
                if (pv.contains(po)) { out.set(i, v); continue outer; }
            }
            out.add(v);
        }
        return out;
    }

    /** Les éléments de plusieurs pages réunis, sans doublon ni élément déjà contenu dans un autre (« Salle » dans « Salle de réunion »). */
    private static String joinList(String key, List<String> vals) {
        LinkedHashMap<String, String> items = new LinkedHashMap<>();
        for (String v : vals) for (String it : v.split("\\s*[,;\\n]\\s*")) { String t = it.trim(); if (t.length() > 1) items.putIfAbsent(plain(t).trim(), t); }
        List<String> keys = new ArrayList<>(items.keySet());
        List<String> keep = new ArrayList<>();
        for (String k : keys) {
            boolean inside = false;
            for (String o : keys) if (!o.equals(k) && (" " + o + " ").contains(" " + k + " ")) { inside = true; break; }
            if (!inside) keep.add(items.get(k));
        }
        int max = key.equals("references") ? 12 : 8;
        String s = String.join(", ", keep.size() > max ? keep.subList(0, max) : keep);
        return s.length() > 600 ? s.substring(0, 600) : s;
    }

    // ───────── Planning précis ─────────

    public record Step(String etape, String debut, String fin, String qui, String note) {}

    /** Une étape type : nom, qui la porte, durée par défaut en jours ouvrés, note par défaut. */
    record StepKind(String name, String qui, int days, String note, boolean extra) {}

    static final List<StepKind> KINDS = List.of(
            new StepKind("Repérages", "Production", 4, "Valider les décors avec la réalisation ; photos et plans d'accès.", false),
            new StepKind("Casting", "Production", 6, "Auditions, puis rappels ; choix des acteurs avec la marque.", false),
            new StepKind("Rappels de casting", "Réalisation", 1, "Deuxième audition des finalistes, en situation, avec la réalisation.", true),
            new StepKind("Essais costumes et maquillage", "Production", 1, "Avec les acteurs retenus ; photos à soumettre à la marque.", false),
            new StepKind("Repérages techniques", "Production", 1, "Chef opérateur, électro et machino sur chaque décor : accès, électricité, lumière.", true),
            new StepKind("PPM (réunion de préparation)", "Marque", 1, "Validation finale : acteurs, décors, costumes, découpage, planning.", false),
            new StepKind("Lecture avec les comédiens", "Réalisation", 1, "Lecture du scénario et répétition des scènes clés.", true),
            new StepKind("Tournage", "Réalisation", 0, "Feuille de service la veille de chaque jour.", false),
            new StepKind("Montage", "Post-production", 5, "Premier montage le 3e jour, version validée par la réalisation à la fin.", false),
            new StepKind("Voix off et musique", "Post-production", 1, "Enregistrement de la voix off, choix et droits de la musique.", true),
            new StepKind("Étalonnage, son et musique", "Post-production", 3, "Étalonnage, mixage, voix off, sous-titres.", false),
            new StepKind("Validation de la marque", "Marque", 3, "Deux allers-retours de corrections au plus.", false),
            new StepKind("Sous-titrage", "Post-production", 1, "Sous-titres incrustés pour les versions sans le son.", true),
            new StepKind("Déclinaisons réseaux sociaux", "Post-production", 2, "Recadrages 9:16 et 1:1, versions courtes 15 s et 6 s.", true),
            new StepKind("Livraison des fichiers", "Production", 1, "Masters TV et réseaux sociaux (16:9, 9:16, 1:1) aux régies.", false));
    static final Map<String, StepKind> KIND_BY_NAME = new LinkedHashMap<>();
    static { for (StepKind k : KINDS) KIND_BY_NAME.put(plain(k.name()).trim(), k); }

    /**
     * Le rétroplanning d'un film publicitaire, comme le pose un producteur : repérages et casting trois semaines avant,
     * essais, PPM, tournage, montage, étalonnage, validations et livraison, sur jours ouvrés.
     */
    public static List<Step> baseline(LocalDate s, LocalDate e, LocalDate diff) {
        return schedule(s, e, diff, Map.of(), Set.of(), Map.of());
    }

    /**
     * Calcule les dates, toujours de la même façon : la préparation remonte depuis le premier jour de tournage, la post-production
     * part du lendemain du dernier jour, tout sur jours ouvrés ; si la diffusion est trop proche, la post-production est resserrée.
     * L'IA ne choisit que les durées, les étapes utiles et les notes : les dates ne peuvent donc jamais être incohérentes.
     */
    static List<Step> schedule(LocalDate s, LocalDate e, LocalDate diff, Map<String, Integer> days, Set<String> extras, Map<String, String> notes) {
        java.util.function.Function<String, Integer> d = n -> Math.max(1, Math.min(15, days.getOrDefault(n, KIND_BY_NAME.get(plain(n).trim()).days())));
        java.util.function.BiFunction<String, String[], Step> mk = (n, ab) -> {
            StepKind k = KIND_BY_NAME.get(plain(n).trim());
            String note = notes.get(n);
            return new Step(n, ab[0], ab[1], k.qui(), note == null || note.isBlank() ? k.note() : cut(note.strip(), 160));
        };
        List<Step> out = new ArrayList<>();
        // Préparation, en remontant depuis le tournage
        LocalDate ppm = back(s, 3);
        LocalDate essais = back(s, 5);
        LocalDate castEnd = back(s, 7), castStart = back(castEnd, d.apply("Casting") - 1);
        LocalDate repEnd = back(s, 8), repStart = back(repEnd, d.apply("Repérages") - 1);
        out.add(mk.apply("Repérages", new String[]{iso(repStart), iso(repEnd)}));
        out.add(mk.apply("Casting", new String[]{iso(castStart), iso(castEnd)}));
        if (extras.contains("Rappels de casting")) { LocalDate r = fwd(castEnd, 1); out.add(mk.apply("Rappels de casting", new String[]{iso(r), iso(r)})); }
        out.add(mk.apply("Essais costumes et maquillage", new String[]{iso(essais), iso(essais)}));
        if (extras.contains("Repérages techniques")) { LocalDate r = back(s, 4); out.add(mk.apply("Repérages techniques", new String[]{iso(r), iso(r)})); }
        out.add(mk.apply("PPM (réunion de préparation)", new String[]{iso(ppm), iso(ppm)}));
        if (extras.contains("Lecture avec les comédiens")) { LocalDate r = back(s, 2); out.add(mk.apply("Lecture avec les comédiens", new String[]{iso(r), iso(r)})); }
        out.add(mk.apply("Tournage", new String[]{iso(s), iso(e)}));
        // Post-production, en avançant depuis le dernier jour de tournage
        List<String> post = new ArrayList<>(List.of("Montage"));
        if (extras.contains("Voix off et musique")) post.add("Voix off et musique");
        post.add("Étalonnage, son et musique");
        post.add("Validation de la marque");
        if (extras.contains("Sous-titrage")) post.add("Sous-titrage");
        if (extras.contains("Déclinaisons réseaux sociaux")) post.add("Déclinaisons réseaux sociaux");
        Map<String, Integer> len = new LinkedHashMap<>();
        for (String n : post) len.put(n, d.apply(n));
        LocalDate deadline = diff == null ? null : back(diff, 3);   // livrer trois jours ouvrés avant la diffusion
        for (int guard = 0; guard < 40 && deadline != null && workdays(e, deadline) < len.values().stream().mapToInt(Integer::intValue).sum() + 1; guard++) {
            String longest = len.entrySet().stream().max(Map.Entry.comparingByValue()).orElseThrow().getKey();
            if (len.get(longest) <= 1) break;
            len.put(longest, len.get(longest) - 1);
        }
        LocalDate cur = e;
        for (String n : post) {
            LocalDate a = fwd(cur, 1), b = fwd(a, len.get(n) - 1);
            out.add(mk.apply(n, new String[]{iso(a), iso(b)}));
            cur = b;
        }
        LocalDate deliver = fwd(cur, 1);
        out.add(mk.apply("Livraison des fichiers", new String[]{iso(deliver), iso(deliver)}));
        if (diff != null) out.add(new Step("Première diffusion", iso(diff), iso(diff), "Marque", ""));
        return out;
    }

    /**
     * Une note de l'IA n'est gardée que si elle parle de CE projet (un mot du projet : décor, produit, support…) et n'est pas
     * un raisonnement (« plusieurs décors nécessitent plus… ») ni un commentaire sur l'étape (« facultatif »). Sinon, la note type reste.
     */
    static boolean usefulNote(String n, String ctx) {
        if (n == null || n.strip().length() < 12) return false;
        String p = plain(n);
        if (p.matches(".*(facultati|neglig|necessit|optionnel|par defaut|si besoin).*")) return false;
        String c = " " + plain(ctx) + " ";
        return words(n).stream().anyMatch(w -> w.length() >= 5 && c.contains(" " + w));
    }

    /** n jours ouvrés avant / après (0 : le jour ouvré le plus proche). */
    static LocalDate back(LocalDate d, int n) { LocalDate x = until(d); for (int i = 0; i < n; i++) x = until(x.minusDays(1)); return x; }
    static LocalDate fwd(LocalDate d, int n) { LocalDate x = n == 0 ? from(d) : d; for (int i = 0; i < n; i++) x = from(x.plusDays(1)); return x; }
    static int workdays(LocalDate a, LocalDate b) { int n = 0; for (LocalDate x = a.plusDays(1); !x.isAfter(b); x = x.plusDays(1)) if (x.getDayOfWeek().getValue() < 6) n++; return n; }

    /** L'IA adapte le rétroplanning au projet : durée de chaque étape, étapes utiles en plus, une note concrète par étape. */
    public Optional<List<Step>> planning(Map<String, String> vals, List<Step> base) {
        Step shoot = base.stream().filter(x -> x.etape().equals("Tournage")).findFirst().orElse(null);
        if (shoot == null) return Optional.empty();
        Step air = base.stream().filter(x -> x.etape().equals("Première diffusion")).findFirst().orElse(null);
        StringBuilder ctx = new StringBuilder();
        for (String k : List.of("titre", "produit", "duree", "supports", "format", "lieux", "dates_tournage", "diffusion", "idee", "deroule")) {
            String v = vals.get(k);
            if (v != null && !v.isBlank()) ctx.append("- ").append(SheetSchema.BY_KEY.get(k).label()).append(" : ").append(v.length() > 300 ? v.substring(0, 300) : v).append('\n');
        }
        StringBuilder cat = new StringBuilder();
        for (StepKind k : KINDS) if (!k.name().equals("Tournage"))
            cat.append("- \"").append(k.name()).append("\"").append(k.extra() ? " (facultative)" : "").append(" : ").append(k.days()).append(" j par défaut\n");
        String prompt = "Tu es directeur·rice de production de films publicitaires. Voici le projet :\n" + ctx
                + "\nLes étapes possibles du rétroplanning (durée en jours ouvrés) :\n" + cat
                + """

                Adapte le rétroplanning à CE projet :
                - "jours" : la durée réaliste de chaque étape pour ce projet (plus de lieux = plus de repérages, plus de rôles = plus de casting, plus de versions ou de supports = plus de post-production) ;
                - garde les étapes facultatives seulement si le projet en a besoin (voix off, réseaux sociaux, sous-titres, plusieurs décors…) ;
                - "note" : une phrase concrète pour CE projet (qui fait quoi, quel livrable), au plus 120 caractères.
                Ne donne aucune date : elles sont calculées à partir des jours de tournage.
                Réponds UNIQUEMENT par un objet JSON :
                {"etapes": [{"etape": "nom exact", "jours": 3, "note": "..."}], "en_plus": ["nom exact d'une étape facultative utile"]}
                """;
        Map<?, ?> res = ask(sheetModel, prompt, 1200, 0.2);
        if (res == null || !(res.get("etapes") instanceof List<?> list)) return Optional.empty();
        Map<String, Integer> days = new HashMap<>();
        Set<String> extras = new HashSet<>();
        Map<String, String> notes = new HashMap<>();
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) continue;
            String et = str(m.get("etape"));
            StepKind k = et == null ? null : KIND_BY_NAME.get(plain(et).trim());
            if (k == null || k.name().equals("Tournage")) continue;
            try { days.put(k.name(), (int) Math.round(Double.parseDouble(String.valueOf(m.get("jours")).replaceAll("[^0-9.]", "")))); } catch (Exception ignored) { }
            String n = str(m.get("note"));
            if (usefulNote(n, ctx.toString())) notes.put(k.name(), n.strip());
        }
        if (res.get("en_plus") instanceof List<?> more)
            for (Object o : more) { StepKind k = KIND_BY_NAME.get(plain(String.valueOf(o)).trim()); if (k != null && k.extra()) extras.add(k.name()); }
        if (days.isEmpty() && notes.isEmpty()) return Optional.empty();
        return Optional.of(schedule(LocalDate.parse(shoot.debut()), LocalDate.parse(shoot.fin()), air == null ? null : LocalDate.parse(air.debut()), days, extras, notes));
    }

    public String toJson(List<Step> steps) {
        try { return json.writeValueAsString(steps); } catch (Exception e) { return "[]"; }
    }

    // ───────── Aide à la rédaction d'un champ (modèle rapide) ─────────

    public Optional<String> draft(String prompt) {
        Map<?, ?> res = ask(draftModel, prompt, 400, 0.4);
        if (res == null) return Optional.empty();
        String t = str(res.get("texte"));
        return t == null || t.isBlank() ? Optional.empty() : Optional.of(cut(t.strip(), 1200));
    }

    // ───────── Ollama ─────────

    /** Un appel à l'IA locale qui rend un objet JSON ; repli sur le modèle de base si le modèle demandé n'est pas installé. */
    Map<?, ?> ask(String model, String prompt, int maxTokens, double temperature) {
        for (String m : model.equals(baseModel) ? List.of(model) : List.of(model, baseModel)) {
            try {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("model", m);
                body.put("prompt", prompt);
                body.put("stream", false);
                body.put("format", "json");
                body.put("keep_alive", "15m");
                body.put("options", Map.of("temperature", temperature, "num_predict", maxTokens, "num_ctx", 6144));
                HttpRequest req = HttpRequest.newBuilder(URI.create(ollamaUrl.replaceAll("/+$", "") + "/api/generate"))
                        .timeout(Duration.ofSeconds(timeoutSeconds)).header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body), StandardCharsets.UTF_8)).build();
                HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                if (resp.statusCode() == 404) { log.warn("Modèle {} absent d'Ollama : repli sur {}", m, baseModel); continue; }
                if (resp.statusCode() != 200) { log.warn("Ollama a répondu {} ({})", resp.statusCode(), m); return null; }
                Map<?, ?> res = json.readValue(resp.body(), Map.class);
                String raw = res == null ? null : (String) res.get("response");
                if (raw == null || raw.indexOf('{') < 0) return null;
                return parseLoose(raw.substring(raw.indexOf('{')));
            } catch (Exception e) {
                log.warn("IA locale indisponible ({}) : {} {}", m, e.getClass().getSimpleName(), e.getMessage());
                return null;
            }
        }
        return null;
    }

    /** Un JSON coupé net (réponse trop longue) : on garde tout ce qui précède la dernière virgule complète, et on referme. */
    Map<?, ?> parseLoose(String raw) {
        try { return json.readValue(raw, Map.class); } catch (Exception ignored) { }
        int end = raw.length();
        for (int tries = 0; tries < 40; tries++) {
            end = raw.lastIndexOf(',', end - 1);
            if (end <= 0) return null;
            String head = raw.substring(0, end);
            int depth = 0; boolean inStr = false;
            for (int i = 0; i < head.length(); i++) {
                char c = head.charAt(i);
                if (c == '\\') { i++; continue; }
                if (c == '"') inStr = !inStr;
                else if (!inStr && c == '{') depth++;
                else if (!inStr && c == '}') depth--;
            }
            if (inStr || depth <= 0) continue;
            try { return json.readValue(head + "}".repeat(depth), Map.class); } catch (Exception ignored) { }
        }
        return null;
    }

    // ───────── Outils ─────────

    static String plain(String s) {
        return Normalizer.normalize(s.toLowerCase(Locale.ROOT), Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .replaceAll("[^a-z0-9]+", " ").replaceAll("\\s+", " ");
    }
    private static String str(Object o) { return o == null ? null : o instanceof String s ? s : String.valueOf(o); }
    private static String cut(String s, int n) { return s.length() > n ? s.substring(0, n) : s; }
    private static String iso(LocalDate d) { return d.toString(); }
    static LocalDate from(LocalDate d) { while (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) d = d.plusDays(1); return d; }
    static LocalDate until(LocalDate d) { while (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) d = d.minusDays(1); return d; }
}
