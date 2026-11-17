package com.castingai.service;

import com.castingai.dto.auth.AuthResponse;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.AuthException;
import com.castingai.exception.ForbiddenException;
import com.castingai.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.Locale;
import java.util.UUID;

/**
 * Connexion avec Google ou Facebook. Le jeton reçu du navigateur est toujours revérifié ici,
 * auprès du fournisseur, avant d'ouvrir une session. Premier passage = compte acteur (freelance).
 */
@Service
@RequiredArgsConstructor
@lombok.extern.slf4j.Slf4j
public class SocialAuthService {

    /** Version de l'API Graph utilisée (appels versionnés : comportement stable). */
    private static final String GRAPH = "https://graph.facebook.com/v21.0";

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final ActorAccountService actorAccounts;
    private final AuthService authService;
    /** Client HTTP vers Google et Facebook ; remplaçable dans les tests. */
    private RestClient http = RestClient.create();

    void useHttp(RestClient client) { this.http = client; }

    @Value("${casting.oauth.google-client-id:}")
    private String googleClientId;
    @Value("${casting.oauth.facebook-app-id:}")
    private String facebookAppId;
    @Value("${casting.oauth.facebook-app-secret:}")
    private String facebookAppSecret;

    /** Identifiants publics des fournisseurs configurés (null si non configuré). */
    public record Providers(String google, String facebook) {}

    public Providers providers() {
        return new Providers(blank(googleClientId) ? null : googleClientId,
                blank(facebookAppId) || blank(facebookAppSecret) ? null : facebookAppId);
    }

    private record Identity(String provider, String id, String email, String firstName, String lastName) {}

    @Transactional
    public AuthResponse google(String idToken) {
        if (blank(googleClientId)) throw new IllegalArgumentException("La connexion Google n'est pas configurée");
        JsonNode t;
        try {
            t = getJson("https://oauth2.googleapis.com/tokeninfo?id_token={t}", idToken);
        } catch (RestClientException e) {
            throw new AuthException("Jeton Google refusé");
        }
        if (t == null || !googleClientId.equals(t.path("aud").asText())
                || !(t.path("iss").asText().endsWith("accounts.google.com"))) {
            throw new AuthException("Jeton Google non destiné à cette application");
        }
        if (!"true".equals(t.path("email_verified").asText())) throw new AuthException("Adresse e-mail Google non vérifiée");
        return signIn(new Identity("GOOGLE", t.path("sub").asText(), t.path("email").asText(),
                t.path("given_name").asText(""), t.path("family_name").asText("")));
    }

    @Transactional
    public AuthResponse facebook(String accessToken) {
        if (providers().facebook() == null) throw new IllegalArgumentException("La connexion Facebook n'est pas configurée");
        try {
            JsonNode dbg = getJson(GRAPH + "/debug_token?input_token={t}&access_token={a}",
                    accessToken, facebookAppId + "|" + facebookAppSecret);
            JsonNode d = dbg == null ? null : dbg.path("data");
            if (d == null || !d.path("is_valid").asBoolean() || !facebookAppId.equals(d.path("app_id").asText())) {
                log.warn("Facebook : jeton invalide ou destiné à une autre application (valide={}, app={})",
                        d == null ? null : d.path("is_valid").asBoolean(), d == null ? null : d.path("app_id").asText());
                throw new AuthException("Jeton Facebook non destiné à cette application");
            }
            // appsecret_proof : exigé par Meta pour les appels serveur quand « Exiger la clé secrète » est actif
            JsonNode me = getJson(GRAPH + "/me?fields=id,first_name,last_name,email&access_token={t}&appsecret_proof={p}",
                    accessToken, appSecretProof(accessToken));
            if (me == null || me.path("email").asText("").isBlank()) {
                throw new AuthException("Facebook n'a pas transmis d'adresse e-mail : autorisez l'accès à l'e-mail ou inscrivez-vous avec un mot de passe");
            }
            return signIn(new Identity("FACEBOOK", me.path("id").asText(), me.path("email").asText(),
                    me.path("first_name").asText(""), me.path("last_name").asText("")));
        } catch (org.springframework.web.client.RestClientResponseException e) {
            // Réponse d'erreur de Facebook (message, type, code) : jamais de jeton dans ce texte
            log.warn("Facebook a refusé l'appel : {} {}", e.getStatusCode(), e.getResponseBodyAsString());
            throw new AuthException("Jeton Facebook refusé");
        } catch (RestClientException e) {
            log.warn("Facebook injoignable : {}", e.getMessage());
            throw new AuthException("Facebook est injoignable pour le moment. Réessayez dans un instant.");
        }
    }

    private static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();

    /**
     * GET puis lecture JSON. La réponse est lue comme du texte : l'API Graph de Facebook répond
     * en « text/javascript », que le convertisseur JSON par défaut refuse.
     */
    private JsonNode getJson(String uri, Object... args) {
        String body = http.get().uri(uri, args).retrieve().body(String.class);
        if (body == null || body.isBlank()) return null;
        try {
            return JSON.readTree(body);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new org.springframework.web.client.RestClientException("Réponse illisible du fournisseur d'identité", e);
        }
    }

    /** HMAC-SHA256 du jeton utilisateur avec la clé secrète de l'application, en hexadécimal. */
    private String appSecretProof(String accessToken) {
        try {
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(facebookAppSecret.getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256"));
            return java.util.HexFormat.of().formatHex(mac.doFinal(accessToken.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException("Calcul de appsecret_proof impossible", e);
        }
    }

    private AuthResponse signIn(Identity id) {
        String email = id.email().trim().toLowerCase(Locale.ROOT);
        User u = users.findByAuthProviderAndProviderId(id.provider(), id.id())
                .or(() -> users.findByEmail(email))
                .orElse(null);
        if (u == null) {
            u = User.builder()
                    .email(email)
                    .firstName(id.firstName().isBlank() ? email.substring(0, email.indexOf('@')) : id.firstName())
                    .lastName(id.lastName().isBlank() ? "—" : id.lastName())
                    .password(passwordEncoder.encode(UUID.randomUUID().toString()))   // pas de mot de passe connu
                    .role(Role.ACTEUR).enabled(true)
                    .authProvider(id.provider()).providerId(id.id())
                    .build();
            u = users.save(u);
            actorAccounts.createFicheFor(u, "INSCRIPTION");
        } else if (u.getProviderId() == null) {
            // Compte existant avec la même adresse (vérifiée par le fournisseur) : on le relie.
            u.setAuthProvider(id.provider());
            u.setProviderId(id.id());
            u = users.save(u);
        }
        if (!u.isEnabled()) throw new ForbiddenException("Ce compte est désactivé. Contactez l'administrateur de l'agence.");
        return authService.buildAuthResponse(u);
    }

    private static boolean blank(String s) { return s == null || s.isBlank(); }
}
