package com.castingai.config;

import io.jsonwebtoken.io.Decoders;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * T-106 · En production, le serveur refuse de démarrer avec des secrets absents, faibles
 * ou identiques aux valeurs de développement publiées dans le dépôt. Vérifié pendant la création
 * du contexte, donc avant que le serveur web n'accepte la moindre connexion.
 */
@Slf4j
@Component
@Profile("prod")
public class ProductionGuard implements InitializingBean {

    /** Valeurs de développement connues (présentes dans application.yml et docker-compose.yml). */
    static final Set<String> DEV_VALUES = Set.of(
            "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970",
            "casting_pass", "minio_password", "minio_admin", "password123", "guest");

    @Value("${jwt.secret:}") String jwtSecret;
    @Value("${spring.datasource.password:}") String dbPassword;
    @Value("${minio.access-key:}") String minioAccessKey;
    @Value("${minio.secret-key:}") String minioSecretKey;

    @Override
    public void afterPropertiesSet() {   // avant l'ouverture du port : aucune requête acceptée
        List<String> problems = check(jwtSecret, dbPassword, minioAccessKey, minioSecretKey);
        if (!problems.isEmpty()) {
            throw new IllegalStateException("Démarrage en production refusé :\n - " + String.join("\n - ", problems));
        }
        log.info("Production : secrets vérifiés (aucune valeur de développement).");
    }

    /** Liste des problèmes de configuration ; vide si tout est correct. */
    static List<String> check(String jwt, String dbPassword, String minioAccess, String minioSecret) {
        List<String> p = new ArrayList<>();
        if (blank(jwt)) p.add("JWT_SECRET manquant (clé Base64 d'au moins 32 octets, ex. : openssl rand -base64 48).");
        else if (DEV_VALUES.contains(jwt)) p.add("JWT_SECRET est la clé de développement publiée dans le dépôt : générez-en une nouvelle.");
        else {
            try {
                if (Decoders.BASE64.decode(jwt).length < 32) p.add("JWT_SECRET trop court : 32 octets au moins une fois décodé.");
            } catch (RuntimeException e) {
                p.add("JWT_SECRET n'est pas du Base64 valide.");
            }
        }
        weak(p, "DB_PASSWORD", dbPassword, 12);
        weak(p, "S3_ACCESS_KEY", minioAccess, 8);
        weak(p, "S3_SECRET_KEY", minioSecret, 16);
        return p;
    }

    private static void weak(List<String> p, String name, String value, int min) {
        if (blank(value)) p.add(name + " manquant.");
        else if (DEV_VALUES.contains(value)) p.add(name + " utilise la valeur de développement : changez-la.");
        else if (value.length() < min) p.add(name + " trop court (" + min + " caractères au moins).");
    }

    private static boolean blank(String s) { return s == null || s.isBlank(); }
}
