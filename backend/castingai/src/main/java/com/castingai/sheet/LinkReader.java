package com.castingai.sheet;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * P-083 · Lit le texte public d'un lien (présentation Canva, page web) pour que l'IA remplisse la fiche.
 * Canva rend ses présentations en JavaScript : on récupère ce qui est public (titre, description,
 * textes présents dans la page). Si c'est trop maigre, on le dit et on demande le PDF.
 * Sécurité : https uniquement, jamais d'adresse interne (localhost, réseau privé), 3 Mo et 15 s au plus.
 */
@Component
@Slf4j
public class LinkReader {

    public record Reading(String text, String title, boolean partial, String message) {}

    private static final int MAX_BYTES = 3 * 1024 * 1024;
    private static final String UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).followRedirects(HttpClient.Redirect.NEVER).build();

    public Reading read(String url) {
        URI uri = check(url);
        boolean canva = isCanva(uri);
        String html = get(uri, 0);
        Set<String> parts = new LinkedHashSet<>();
        String title = first(meta(html, "og:title"), tag(html, "title"));
        if (title != null) parts.add(title);
        String desc = first(meta(html, "og:description"), meta(html, "description"));
        if (desc != null) parts.add(desc);
        if (canva) {
            // oEmbed public de Canva : titre et auteur
            try {
                String o = get(URI.create("https://www.canva.com/_oembed?url=" + URLEncoder.encode(url, StandardCharsets.UTF_8)), 0);
                String t = jsonString(o, "title");
                if (t != null) { parts.add(t); if (title == null) title = t; }
            } catch (Exception e) { log.debug("oEmbed Canva indisponible : {}", e.getMessage()); }
            // Textes de la présentation présents dans les données de la page, quand Canva les y met
            for (String s : jsonStrings(html, "text")) if (s.length() > 2 && s.length() < 2000) parts.add(s);
        }
        String body = visibleText(html);
        if (!canva && body.length() > 40) parts.add(body);
        String text = String.join("\n", parts).trim();
        if (text.length() > 20000) text = text.substring(0, 20000);
        boolean partial = canva && text.length() < 400;
        String message = partial
                ? "Canva ne rend public que le titre et la description de cette présentation. Pour que l'IA lise toutes les diapositives, déposez aussi le PDF (Partager › Télécharger › PDF)."
                : null;
        return new Reading(text, title, partial, message);
    }

    static boolean isCanva(URI u) { String h = u.getHost() == null ? "" : u.getHost().toLowerCase(); return h.equals("canva.com") || h.endsWith(".canva.com") || h.endsWith("canva.link"); }

    /** https seulement, et jamais vers la machine elle-même ni le réseau privé. */
    static URI check(String url) {
        URI u;
        try { u = URI.create(url == null ? "" : url.trim()); } catch (Exception e) { throw new IllegalArgumentException("Ce lien n'est pas valide"); }
        if (!"https".equalsIgnoreCase(u.getScheme()) || u.getHost() == null) throw new IllegalArgumentException("Collez un lien qui commence par https://");
        try {
            for (InetAddress a : InetAddress.getAllByName(u.getHost()))
                if (a.isLoopbackAddress() || a.isSiteLocalAddress() || a.isLinkLocalAddress() || a.isAnyLocalAddress() || a.isMulticastAddress())
                    throw new IllegalArgumentException("Ce lien pointe vers une adresse interne : il ne peut pas être lu");
        } catch (java.net.UnknownHostException e) { throw new IllegalArgumentException("Ce site est introuvable : vérifiez le lien"); }
        return u;
    }

    private String get(URI uri, int hops) {
        try {
            HttpRequest req = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(15)).header("User-Agent", UA)
                    .header("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.6").GET().build();
            HttpResponse<byte[]> r = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
            if (r.statusCode() >= 300 && r.statusCode() < 400 && hops < 4) {
                String loc = r.headers().firstValue("location").orElse(null);
                if (loc != null) return get(check(uri.resolve(loc).toString()), hops + 1);   // chaque redirection est revérifiée
            }
            if (r.statusCode() >= 400) throw new IllegalArgumentException("Le site a refusé la lecture (" + r.statusCode() + "). Le lien est-il public ?");
            byte[] b = r.body();
            return new String(b, 0, Math.min(b.length, MAX_BYTES), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) { throw e; }
        catch (Exception e) { throw new IllegalArgumentException("Le lien n'a pas pu être lu : " + e.getClass().getSimpleName()); }
    }

    static String meta(String html, String name) {
        Matcher m = Pattern.compile("<meta[^>]+(?:property|name)=[\"']" + Pattern.quote(name) + "[\"'][^>]*content=[\"']([^\"']*)[\"']", Pattern.CASE_INSENSITIVE).matcher(html);
        if (m.find()) return clean(m.group(1));
        m = Pattern.compile("<meta[^>]+content=[\"']([^\"']*)[\"'][^>]*(?:property|name)=[\"']" + Pattern.quote(name) + "[\"']", Pattern.CASE_INSENSITIVE).matcher(html);
        return m.find() ? clean(m.group(1)) : null;
    }

    static String tag(String html, String t) {
        Matcher m = Pattern.compile("<" + t + "[^>]*>(.*?)</" + t + ">", Pattern.CASE_INSENSITIVE | Pattern.DOTALL).matcher(html);
        return m.find() ? clean(m.group(1)) : null;
    }

    static String jsonString(String json, String key) {
        Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"").matcher(json);
        return m.find() ? unescape(m.group(1)) : null;
    }

    static List<String> jsonStrings(String html, String key) {
        List<String> out = new ArrayList<>();
        Matcher m = Pattern.compile("\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.){3,2000})\"").matcher(html);
        while (m.find() && out.size() < 400) out.add(unescape(m.group(1)).trim());
        return out;
    }

    static String visibleText(String html) {
        String t = html.replaceAll("(?is)<(script|style|noscript|svg|template)[^>]*>.*?</\\1>", " ")
                .replaceAll("(?is)<br\\s*/?>|</(p|div|li|h[1-6]|tr|section)>", "\n")
                .replaceAll("(?s)<[^>]+>", " ");
        String c = clean(t);
        if (c == null) return "";
        return c.replaceAll("[ \\t]+", " ").replaceAll("\\s*\\n\\s*", "\n").replaceAll("\\n{3,}", "\n\n").trim();
    }

    private static String unescape(String s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\' && i + 1 < s.length()) {
                char n = s.charAt(++i);
                switch (n) {
                    case 'n' -> sb.append('\n'); case 't' -> sb.append(' '); case 'r' -> {}
                    case 'u' -> { if (i + 4 < s.length()) { try { sb.append((char) Integer.parseInt(s.substring(i + 1, i + 5), 16)); } catch (NumberFormatException e) { /* ignoré */ } i += 4; } }
                    default -> sb.append(n);
                }
            } else sb.append(c);
        }
        return sb.toString();
    }

    private static String clean(String s) {
        if (s == null) return null;
        String t = s.replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").replace("&#x27;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ").trim();
        return t.isEmpty() ? null : t;
    }

    private static String first(String a, String b) { return a != null ? a : b; }
}
