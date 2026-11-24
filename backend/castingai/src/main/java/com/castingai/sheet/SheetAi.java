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
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * P-083 · Lit un brief, une présentation ou une note et en tire les champs de la fiche.
 * Deux passes : des règles fixes (« Cible : … »), toujours, puis l'IA locale (Ollama, gratuite,
 * rien ne sort de la machine) qui complète. L'IA ne doit rien inventer : un champ absent du texte reste vide.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SheetAi {

    public record Extraction(Map<String, String> values, String engine) {}

    private final ObjectMapper json;

    @Value("${casting.ai.model:llama3.2}")
    private String model;
    @Value("${spring.ai.ollama.base-url:http://localhost:11434}")
    private String ollamaUrl;
    @Value("${casting.ai.sheet-timeout-seconds:180}")
    private int timeoutSeconds;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    static String prompt() {
        StringBuilder sb = new StringBuilder("""
            Tu remplis la fiche d'un projet de publicité à partir du document ci-dessous (brief, présentation, note).
            Réponds UNIQUEMENT par un objet JSON en français dont les clés sont parmi celles-ci :
            """);
        for (SheetSchema.Field f : SheetSchema.FIELDS) sb.append("- \"").append(f.key()).append("\" : ").append(f.label()).append(" (").append(f.hint()).append(")\n");
        sb.append("""
            Règles :
            - N'écris une clé que si le document en parle clairement. N'invente rien, ne devine rien.
            - Recopie fidèlement, en phrases courtes ; au plus 600 caractères par valeur.
            - "diffusion" au format AAAA-MM-JJ, seulement si une date précise est écrite.
            - Pas de budget, pas de cachets, pas de données personnelles.
            Exemple : {"objectif":"Faire connaître la nouvelle huile d'olive","cible":"Familles tunisiennes, 30 à 50 ans"}
            """);
        return sb.toString();
    }

    public Extraction extract(String text) {
        Map<String, String> out = new LinkedHashMap<>(rules(text));
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", model);
            body.put("prompt", prompt() + "\n\nDOCUMENT :\n" + (text.length() > 12000 ? text.substring(0, 12000) : text));
            body.put("stream", false);
            body.put("format", "json");
            body.put("options", Map.of("temperature", 0.1, "num_predict", 1600, "num_ctx", 8192));
            HttpRequest req = HttpRequest.newBuilder(URI.create(ollamaUrl.replaceAll("/+$", "") + "/api/generate"))
                    .timeout(Duration.ofSeconds(timeoutSeconds)).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body), StandardCharsets.UTF_8)).build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() != 200) throw new IllegalStateException("Ollama a répondu " + resp.statusCode());
            Map<?, ?> res = json.readValue(resp.body(), Map.class);
            String raw = res == null ? null : (String) res.get("response");
            Map<?, ?> n = raw == null || raw.indexOf('{') < 0 ? Map.of() : json.readValue(raw.substring(raw.indexOf('{')), Map.class);
            int added = 0;
            for (var e : n.entrySet()) {
                String k = String.valueOf(e.getKey());
                if (!SheetSchema.BY_KEY.containsKey(k) || !(e.getValue() instanceof String v)) continue;
                String val = normalize(k, v);
                if (val == null || !grounded(val, text)) continue;   // l'IA ne doit rien inventer
                if (!out.containsKey(k)) { out.put(k, val); added++; }
            }
            log.info("Fiche : {} champ(s) par règles, {} de plus par l'IA", out.size() - added, added);
            return new Extraction(out, "IA");
        } catch (Exception e) {
            log.warn("IA de la fiche indisponible, règles seules : {} {}", e.getClass().getSimpleName(), e.getMessage());
            return new Extraction(out, "REGLES");
        }
    }

    /**
     * Aide à la rédaction d'un champ : l'IA locale propose un texte à partir de ce qui est déjà écrit dans la fiche.
     * Le texte va dans le champ en cours d'édition ; la personne le relit avant d'enregistrer. Vide si l'IA est absente.
     */
    public Optional<String> draft(SheetSchema.Field f, Map<String, String> sheet, String current) {
        StringBuilder ctx = new StringBuilder();
        for (SheetSchema.Field o : SheetSchema.FIELDS) {
            String v = sheet.get(o.key());
            if (v != null && !v.isBlank() && !o.key().equals(f.key())) ctx.append("- ").append(o.label()).append(" : ").append(v.length() > 500 ? v.substring(0, 500) : v).append('\n');
        }
        boolean improve = current != null && !current.isBlank();
        String ask = improve
                ? "Améliore ce texte pour le champ « " + f.label() + " » (" + f.hint() + ") : plus clair, plus précis, même sens. Texte actuel : " + current
                : "Rédige le champ « " + f.label() + " » (" + f.hint() + ").";
        String prompt = "Tu es un producteur de films publicitaires expérimenté. Tu aides une équipe à remplir la fiche de son projet.\n"
                + "Ce que la fiche contient déjà :\n" + (ctx.isEmpty() ? "(rien encore)\n" : ctx)
                + ask + "\nRègles : en français, phrases courtes et concrètes, au plus "
                + (f.kind() == SheetSchema.Kind.LONG ? "450" : "120") + " caractères ; reste cohérent avec la fiche ; "
                + "n'invente ni nom de personne, ni prix, ni budget, ni date précise.\n"
                + "Réponds UNIQUEMENT par un objet JSON : {\"texte\": \"...\"}";
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", model);
            body.put("prompt", prompt);
            body.put("stream", false);
            body.put("format", "json");
            body.put("options", Map.of("temperature", 0.5, "num_predict", 400, "num_ctx", 4096));
            HttpRequest req = HttpRequest.newBuilder(URI.create(ollamaUrl.replaceAll("/+$", "") + "/api/generate"))
                    .timeout(Duration.ofSeconds(Math.min(timeoutSeconds, 90))).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body), StandardCharsets.UTF_8)).build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() != 200) return Optional.empty();
            Map<?, ?> res = json.readValue(resp.body(), Map.class);
            String raw = res == null ? null : (String) res.get("response");
            if (raw == null || raw.indexOf('{') < 0) return Optional.empty();
            Map<?, ?> n = json.readValue(raw.substring(raw.indexOf('{')), Map.class);
            Object t = n.get("texte");
            if (!(t instanceof String txt) || txt.isBlank()) return Optional.empty();
            txt = txt.strip();
            return Optional.of(txt.length() > 1200 ? txt.substring(0, 1200) : txt);
        } catch (Exception e) {
            log.warn("Aide à la rédaction indisponible : {} {}", e.getClass().getSimpleName(), e.getMessage());
            return Optional.empty();
        }
    }

    /** Étiquettes courantes des briefs : « Cible : … », « Message clé – … ». */
    private static final Map<String, String> LABELS = new LinkedHashMap<>();
    static {
        LABELS.put("titre", "titre( du projet)?|nom du projet|projet");
        LABELS.put("produit", "produit|service|gamme");
        LABELS.put("diffusion", "date de diffusion|diffusion|lancement|on air");
        LABELS.put("duree", "dur[ée]e( du film)?|format du film|longueur");
        LABELS.put("supports", "supports?( de diffusion)?|m[ée]dias?|canaux|plateformes?");
        LABELS.put("objectif", "objectifs?|but|ambition");
        LABELS.put("cible", "cibles?|public( vis[ée])?|audience|c(oe|œ)ur de cible");
        LABELS.put("message", "message( cl[ée])?|promesse|proposition");
        LABELS.put("ton", "ton|tonalit[ée]|style|registre");
        LABELS.put("contraintes", "contraintes?( de (la )?marque)?|mentions?( l[ée]gales| obligatoires)?|interdits?|à respecter");
        LABELS.put("idee", "id[ée]e|concept|pitch");
        LABELS.put("accroche", "accroche|slogan|signature|baseline|tagline");
        LABELS.put("deroule", "d[ée]roul[ée]|synopsis|sc[ée]nario|storyboard|histoire");
        LABELS.put("references", "r[ée]f[ée]rences?|inspirations?|moodboard");
        LABELS.put("lieux", "lieux?( de tournage)?|d[ée]cors?|location");
        LABELS.put("dates_tournage", "dates? de tournage|tournage");
        LABELS.put("planning", "planning|calendrier|r[ée]troplanning");
        LABELS.put("equipe_tech", "[ée]quipe technique|technique|chef op[ée]rateur");
        LABELS.put("intention", "note d'intention|intention( de r[ée]alisation)?");
        LABELS.put("image", "image|lumi[èe]re|photographie");
        LABELS.put("rythme", "rythme|montage");
        LABELS.put("format", "format|ratio");
    }

    static Map<String, String> rules(String text) {
        Map<String, String> out = new LinkedHashMap<>();
        if (text == null) return out;
        String[] lines = text.split("\\r?\\n");
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            for (var e : LABELS.entrySet()) {
                if (out.containsKey(e.getKey())) continue;
                Matcher m = Pattern.compile("^(?:[•\\-–*#\\d.)\\s]*)(?:" + e.getValue() + ")\\s*[:–\\-]\\s*(.*)$", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE).matcher(line);
                if (!m.find()) continue;
                String v = m.group(m.groupCount()).trim();
                // Valeur sur la ou les lignes suivantes (« Cible : » puis le texte dessous)
                if (v.isEmpty()) {
                    StringBuilder sb = new StringBuilder();
                    for (int j = i + 1; j < lines.length && j <= i + 4; j++) {
                        String nx = lines[j].trim();
                        if (nx.isEmpty() || nx.matches("^[^:]{2,40}:.*")) break;
                        sb.append(sb.length() > 0 ? " " : "").append(nx.replaceAll("^[•\\-–*]\\s*", ""));
                    }
                    v = sb.toString();
                }
                String val = normalize(e.getKey(), v);
                if (val != null) out.put(e.getKey(), val);
                break;
            }
        }
        return out;
    }

    static String normalize(String key, String v) {
        if (v == null) return null;
        String t = v.replaceAll("\\s+", " ").trim();
        if (t.length() < 2 || t.equalsIgnoreCase("null") || t.equalsIgnoreCase("non précisé") || t.equals("-")) return null;
        if (t.length() > 1200) t = t.substring(0, 1197) + "…";
        if (key.equals("diffusion")) return date(t);
        if (key.equals("dates_tournage")) { String r = range(t); return r != null ? r : t; }
        if (key.equals("titre") && t.length() > 160) t = t.substring(0, 160);
        return t;
    }

    /**
     * Une période de tournage écrite (« du 12 au 14 mars 2027 », « 12/03/2027 au 14/03/2027 », « 12 mars 2027 »)
     * → « 2027-03-12/2027-03-14 », sinon rien (le texte d'origine est alors gardé tel quel).
     */
    static String range(String t) {
        String[] mois = {"janvier","fevrier","mars","avril","mai","juin","juillet","aout","septembre","octobre","novembre","decembre"};
        String p = plain(t);
        Matcher iso = Pattern.compile("(\\d{4}-\\d{2}-\\d{2})\\s*(?:/|au|a|-|→)\\s*(\\d{4}-\\d{2}-\\d{2})").matcher(p);
        try {
            if (iso.find()) return order(LocalDate.parse(iso.group(1)), LocalDate.parse(iso.group(2)));
            Matcher num = Pattern.compile("(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{4})\\s*(?:au|a|-|–|→)\\s*(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{4})").matcher(p);
            if (num.find()) return order(LocalDate.of(i(num, 3), i(num, 2), i(num, 1)), LocalDate.of(i(num, 6), i(num, 5), i(num, 4)));
            String mo = "(" + String.join("|", mois) + ")";
            Matcher two = Pattern.compile("(\\d{1,2})(?:er)?\\s+" + mo + "(?:\\s+(\\d{4}))?\\s*(?:au|a|-|–)\\s*(\\d{1,2})(?:er)?\\s+" + mo + "\\s+(\\d{4})").matcher(p);
            if (two.find()) {
                int y2 = i(two, 6), y1 = two.group(3) != null ? i(two, 3) : y2;
                return order(LocalDate.of(y1, Arrays.asList(mois).indexOf(two.group(2)) + 1, i(two, 1)), LocalDate.of(y2, Arrays.asList(mois).indexOf(two.group(5)) + 1, i(two, 4)));
            }
            Matcher one = Pattern.compile("(\\d{1,2})(?:er)?\\s*(?:au|a|-|–|et)\\s*(\\d{1,2})(?:er)?\\s+" + mo + "\\s+(\\d{4})").matcher(p);
            if (one.find()) {
                int m = Arrays.asList(mois).indexOf(one.group(3)) + 1, y = i(one, 4);
                return order(LocalDate.of(y, m, i(one, 1)), LocalDate.of(y, m, i(one, 2)));
            }
            String d = date(t);
            if (d != null) return d + "/" + d;
        } catch (Exception ignored) { }
        return null;
    }
    private static int i(Matcher m, int g) { return Integer.parseInt(m.group(g)); }
    private static String order(LocalDate a, LocalDate b) { return a.isAfter(b) ? b + "/" + a : a + "/" + b; }

    /** Une date écrite (2027-03-15, 15/03/2027, 15 mars 2027), sinon rien. */
    static String date(String t) {
        try { return LocalDate.parse(t.substring(0, Math.min(10, t.length()))).toString(); } catch (Exception ignored) { }
        Matcher m = Pattern.compile("(\\d{1,2})[/.-](\\d{1,2})[/.-](\\d{4})").matcher(t);
        if (m.find()) try { return LocalDate.of(Integer.parseInt(m.group(3)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(1))).toString(); } catch (Exception ignored) { }
        String[] mois = {"janvier","fevrier","mars","avril","mai","juin","juillet","aout","septembre","octobre","novembre","decembre"};
        String plain = Normalizer.normalize(t.toLowerCase(), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        m = Pattern.compile("(\\d{1,2})(?:er)?\\s+(" + String.join("|", mois) + ")\\s+(\\d{4})").matcher(plain);
        if (m.find()) return LocalDate.of(Integer.parseInt(m.group(3)), Arrays.asList(mois).indexOf(m.group(2)) + 1, Integer.parseInt(m.group(1))).format(DateTimeFormatter.ISO_LOCAL_DATE);
        return null;
    }

    /** Garde-fou contre l'invention : au moins un mot significatif de la valeur doit figurer dans le document. */
    static boolean grounded(String value, String text) {
        String doc = plain(text);
        String[] words = plain(value).split("[^a-z0-9]+");
        int meaningful = 0, found = 0;
        for (String w : words) {
            if (w.length() < 5) continue;
            meaningful++;
            if (doc.contains(w)) found++;
        }
        return meaningful == 0 ? doc.contains(plain(value).trim()) || value.matches("\\d{4}-\\d{2}-\\d{2}(/\\d{4}-\\d{2}-\\d{2})?") : found * 2 >= meaningful || found >= 3;
    }

    private static String plain(String s) { return Normalizer.normalize(s.toLowerCase(), Normalizer.Form.NFD).replaceAll("\\p{M}", ""); }
}
