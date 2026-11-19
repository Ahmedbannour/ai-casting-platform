package com.castingai.service;

import com.castingai.entity.AdRequest;
import tools.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;

/**
 * T-160 · Analyse de la V0 pour l'agence marketing, par l'IA locale (Ollama, gratuite, rien ne sort de la machine).
 * Les points manquants « de base » (objectif, cible, message clé, date) sont toujours vérifiés par des règles fixes,
 * pour ne jamais dépendre de l'IA ; l'IA ajoute le résumé, les manques de fond et les questions à poser à la marque.
 * Si l'IA ne répond pas, l'analyse est faite par les règles seules et marquée comme telle.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class V0Analyzer {

    public record Result(String summary, List<String> missing, List<String> questions, String source) {}

    private final ObjectMapper json;

    @Value("${casting.ai.model:llama3.2}")
    private String model;
    @Value("${spring.ai.ollama.base-url:http://localhost:11434}")
    private String ollamaUrl;
    /** Le modèle local met 10 à 60 s à lire une V0 : délai long, propre à l'analyse. */
    @Value("${casting.ai.v0-timeout-seconds:180}")
    private int timeoutSeconds;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    static final String PROMPT = """
        Tu aides une agence marketing qui reçoit la V0 d'une publicité : le fichier artistique où la marque décrit son idée.
        Lis la demande et la V0 ci-dessous, puis réponds UNIQUEMENT par un objet JSON, en français, de cette forme :
        {"resume":"3 à 5 phrases courtes : l'idée, le ton, ce que la marque attend","manquants":["ce qui manque pour écrire le concept"],"questions":["question précise à poser à la marque"]}
        Règles : au plus 5 manquants et 5 questions, chacun en une phrase courte. N'invente rien qui n'est pas dans le texte.
        Le budget n'est jamais dans une V0 : ne le cite pas comme manquant.
        Les questions servent à l'agence pour écrire son concept : durée et format du film, supports de diffusion,
        contraintes de la marque (logo, mentions, produits à montrer), ton, nombre et type de personnages. Pas de questions sur la vie privée des personnages.
        """;

    public Result analyse(AdRequest r, String v0Body, String fileText, String fileName) {
        List<String> missing = new ArrayList<>(rules(r, v0Body, fileText, fileName));
        String text = context(r, v0Body, fileText);
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", model);
            body.put("prompt", PROMPT + "\n\n" + text);
            body.put("stream", false);
            body.put("format", "json");
            body.put("options", Map.of("temperature", 0.2, "num_predict", 1400, "num_ctx", 8192));
            HttpRequest req = HttpRequest.newBuilder(URI.create(ollamaUrl.replaceAll("/+$", "") + "/api/generate"))
                    .timeout(Duration.ofSeconds(timeoutSeconds)).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body), StandardCharsets.UTF_8)).build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() != 200) throw new IllegalStateException("Ollama a répondu " + resp.statusCode());
            Map<?, ?> res = json.readValue(resp.body(), Map.class);
            String raw = res == null ? null : (String) res.get("response");
            Map<?, ?> n = raw == null ? null : json.readValue(raw.substring(Math.max(0, raw.indexOf('{'))), Map.class);
            Object sv = n == null ? null : n.get("resume");
            String summary = sv instanceof String str ? str : null;
            if (summary == null || summary.isBlank()) throw new IllegalStateException("réponse vide");
            for (String m : list(n.get("manquants"))) if (missing.stream().noneMatch(x -> x.equalsIgnoreCase(m))) missing.add(m);
            List<String> questions = list(n.get("questions"));
            // Le petit modèle glisse parfois ses questions dans le résumé : on les en sort.
            Split sp = splitQuestions(summary);
            summary = sp.text();
            for (String q : sp.questions()) if (questions.stream().noneMatch(x -> x.equalsIgnoreCase(q))) questions.add(q);
            for (String q : questionsFor(missing)) if (questions.size() < 6 && questions.stream().noneMatch(x -> x.equalsIgnoreCase(q))) questions.add(q);
            return new Result(summary.trim(), cap(missing, 8), cap(questions, 6), "IA");
        } catch (Exception e) {
            log.warn("Analyse IA de la V0 indisponible, règles seules : {} {}", e.getClass().getSimpleName(), e.getMessage());
            return new Result(fallbackSummary(r, v0Body, fileText), cap(missing, 8), cap(questionsFor(missing), 6), "REGLES");
        }
    }

    record Split(String text, List<String> questions) {}

    /** Sépare les questions (phrases finissant par « ? ») et l'amorce « les questions à poser… » du texte du résumé. */
    static Split splitQuestions(String summary) {
        List<String> qs = new ArrayList<>();
        StringBuilder rest = new StringBuilder();
        String t = summary.replaceAll("(?i)(les )?questions (à|a) poser (à|a) la marque( sont)?\\s*:?", " ");
        for (String sentence : t.split("(?<=[.?!])\\s+")) {
            String x = sentence.trim();
            if (x.isEmpty()) continue;
            if (x.endsWith("?")) qs.add(x.replaceAll("^[:\\-–•\\s]+", ""));
            else rest.append(rest.length() == 0 ? "" : " ").append(x);
        }
        String text = rest.toString().replaceAll("\\s+", " ").replaceAll("\\s*:\\s*$", ".").trim();
        return new Split(text.isEmpty() ? summary.trim() : text, qs);
    }

    /** Ce qui manque à coup sûr, sans IA. */
    static List<String> rules(AdRequest r, String v0Body, String fileText, String fileName) {
        List<String> m = new ArrayList<>();
        if (blank(r.getObjective())) m.add("L'objectif de la publicité n'est pas précisé.");
        if (blank(r.getTarget())) m.add("La cible n'est pas décrite.");
        if (blank(r.getKeyMessage())) m.add("Le message clé n'est pas donné.");
        if (r.getAirDate() == null) m.add("La date de diffusion n'est pas fixée.");
        if (fileName != null && fileText == null) m.add("Le fichier « " + fileName + " » n'a pas pu être lu automatiquement : à lire à la main.");
        int len = (v0Body == null ? 0 : v0Body.trim().length()) + (fileText == null ? 0 : fileText.length());
        if (len < 200) m.add("La V0 est très courte : peu de détails sur l'idée, le ton et les personnages.");
        return m;
    }

    static List<String> questionsFor(List<String> missing) {
        List<String> q = new ArrayList<>();
        for (String m : missing) {
            if (m.startsWith("L'objectif")) q.add("Que doit faire la publicité en priorité : faire connaître, faire acheter, changer l'image ?");
            else if (m.startsWith("La cible")) q.add("À qui s'adresse-t-elle (âge, mode de vie, région) ?");
            else if (m.startsWith("Le message")) q.add("Quelle phrase le public doit-il retenir ?");
            else if (m.startsWith("La date")) q.add("Quand la publicité doit-elle être diffusée, et sur quels supports ?");
            else if (m.startsWith("La V0 est très courte")) q.add("Pouvez-vous préciser le ton, l'univers et les personnages que vous imaginez ?");
        }
        return q;
    }

    private static String context(AdRequest r, String v0Body, String fileText) {
        StringBuilder sb = new StringBuilder("DEMANDE\nTitre : ").append(r.getTitle());
        add(sb, "Produit", r.getProduct()); add(sb, "Objectif", r.getObjective()); add(sb, "Cible", r.getTarget());
        add(sb, "Message clé", r.getKeyMessage()); if (r.getAirDate() != null) add(sb, "Diffusion", r.getAirDate().toString());
        sb.append("\n\nV0 (texte)\n").append(blank(v0Body) ? "(aucun)" : v0Body.trim());
        sb.append("\n\nV0 (fichier)\n").append(fileText == null ? "(aucun fichier lisible)" : fileText);
        String s = sb.toString();
        return s.length() > 14000 ? s.substring(0, 14000) : s;
    }

    private static String fallbackSummary(AdRequest r, String v0Body, String fileText) {
        String t = !blank(v0Body) ? v0Body.trim() : fileText != null ? fileText : "";
        String head = t.length() > 400 ? t.substring(0, 400).replaceAll("\\s+\\S*$", "") + "…" : t;
        return "« " + r.getTitle() + " »" + (blank(r.getProduct()) ? "" : " pour " + r.getProduct()) + ". "
                + (head.isBlank() ? "La V0 ne contient pas de texte lisible." : "Début de la V0 : " + head);
    }

    private static List<String> list(Object a) {
        List<String> out = new ArrayList<>();
        if (a instanceof List<?> l) for (Object x : l) {
            String s = x == null ? "" : String.valueOf(x).trim();
            if (s.isEmpty() || s.toLowerCase().contains("budget")) continue;
            s = Character.toUpperCase(s.charAt(0)) + s.substring(1);
            if (!s.endsWith(".") && !s.endsWith("?") && !s.endsWith("!")) s += ".";
            out.add(s);
        }
        return out;
    }
    private static List<String> cap(List<String> l, int n) { return l.size() > n ? new ArrayList<>(l.subList(0, n)) : l; }
    private static void add(StringBuilder sb, String k, String v) { if (!blank(v)) sb.append('\n').append(k).append(" : ").append(v.trim()); }
    private static boolean blank(String s) { return s == null || s.isBlank(); }
}
