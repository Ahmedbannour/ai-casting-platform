package com.castingai.storage;

import com.castingai.config.JwtConfig;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.core.JsonGenerator;
import tools.jackson.databind.SerializationContext;
import tools.jackson.databind.ValueSerializer;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

/**
 * T-109 · Liens signés pour les photos et documents.
 * Le stockage est privé : une photo n'est servie (par /api/media/…) qu'avec une signature valable
 * environ une heure. Les liens sont arrondis à la demi-heure pour que le navigateur garde les images en cache.
 * La signature est calculée avec une clé dérivée du secret de l'application (jamais envoyée au navigateur).
 */
@Component
@RequiredArgsConstructor
public class MediaUrls {

    public static final long WINDOW = 1800, MIN_LIFETIME = 3600;
    private static volatile MediaUrls INSTANCE;

    private final StorageService storage;
    private final JwtConfig jwt;
    private byte[] key;

    @PostConstruct
    void init() throws Exception {
        key = MessageDigest.getInstance("SHA-256").digest(("media:" + jwt.getSecret()).getBytes(StandardCharsets.UTF_8));
        INSTANCE = this;
    }

    /** Adresse signée pour une adresse stockée ; une adresse extérieure (ou vide) est rendue telle quelle. */
    public String sign(String storedUrl) {
        if (storedUrl == null || storedUrl.isBlank() || storedUrl.startsWith("/api/media/")) return storedUrl;
        String objectKey = storage.keyFromUrl(storedUrl);
        if (objectKey == null) return storedUrl;
        long now = System.currentTimeMillis() / 1000;
        long exp = ((now + MIN_LIFETIME) / WINDOW + 1) * WINDOW;          // stable pendant 30 min, valable 1 h à 1 h 30
        return "/api/media/" + encodePath(objectKey) + "?e=" + exp + "&s=" + mac(objectKey + "\n" + exp);
    }

    /** Vérifie une demande /api/media/… : signature exacte et lien non expiré. */
    public boolean valid(String objectKey, long exp, String sig) {
        if (sig == null || exp < System.currentTimeMillis() / 1000) return false;
        return MessageDigest.isEqual(mac(objectKey + "\n" + exp).getBytes(StandardCharsets.US_ASCII), sig.getBytes(StandardCharsets.US_ASCII));
    }

    private String mac(String data) {
        try {
            Mac m = Mac.getInstance("HmacSHA256");
            m.init(new SecretKeySpec(key, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(m.doFinal(data.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static String encodePath(String objectKey) {
        StringBuilder sb = new StringBuilder();
        for (String part : objectKey.split("/")) {
            if (sb.length() > 0) sb.append('/');
            sb.append(URLEncoder.encode(part, StandardCharsets.UTF_8).replace("+", "%20"));
        }
        return sb.toString();
    }

    /** Sérialiseur JSON : à poser sur chaque champ qui porte une adresse de photo ou de document. */
    public static class Signed extends ValueSerializer<String> {
        @Override
        public void serialize(String value, JsonGenerator gen, SerializationContext ctxt) {
            MediaUrls m = INSTANCE;
            gen.writeString(m == null ? value : m.sign(value));
        }
    }
}
