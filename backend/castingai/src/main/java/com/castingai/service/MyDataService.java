package com.castingai.service;

import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.ForbiddenException;
import com.castingai.storage.StorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * T-110 · « Mes données » : l'acteur télécharge tout ce que la plateforme garde sur lui (archive ZIP)
 * et peut supprimer son compte, avec effacement de sa fiche, de ses photos et de ses documents.
 * Loi organique tunisienne n° 2004-63 et RGPD (droits d'accès, de portabilité et d'effacement).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MyDataService {

    private static final ObjectMapper JSON = JsonMapper.builder().enable(SerializationFeature.INDENT_OUTPUT).build();
    public static final String CONFIRM = "SUPPRIMER";

    private final JdbcTemplate jdbc;
    private final StorageService storage;
    private final PasswordEncoder passwordEncoder;
    private final AuditService audit;

    // ───────────────────────── Export ─────────────────────────

    @Transactional
    public byte[] export(User u) throws Exception {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("export", Map.of("plateforme", "AI Casting", "date", new Date().toString(),
                "contenu", "Toutes les données personnelles liées à votre compte au moment de l'export."));
        data.put("compte", one("select email, first_name as prenom, last_name as nom, role, auth_provider as connexion, created_at as cree_le, email_verified_at as email_verifie_le from users where id = ?", u.getId()));
        data.put("consentements", list("select document, version, accepted_at as accepte_le, source, age_statement as age, guardian_name as representant_legal from consents where user_id = ? order by accepted_at", u.getId()));
        UUID actorId = actorOf(u);
        List<Map<String, Object>> photos = List.of(), docs = List.of();
        if (actorId != null) {
            data.put("fiche", one("select first_name as prenom, last_name as nom, birth_date as naissance, gender as genre, city as ville, country as pays, phone as telephone, email, bio, height as taille, weight as poids, eye_color as yeux, hair_color as cheveux, visibility as visibilite, created_at as cree_le, updated_at as modifie_le from actors where id = ?", actorId));
            data.put("competences", list("select * from actor_skills where actor_id = ?", actorId));
            data.put("langues", list("select * from actor_languages where actor_id = ?", actorId));
            data.put("experiences", list("select * from actor_experiences where actor_id = ?", actorId));
            data.put("disponibilites", list("select * from actor_availabilities where actor_id = ?", actorId));
            photos = list("select original_name, url, thumbnail_url, size, is_main, created_at from actor_photos where actor_id = ? order by created_at", actorId);
            docs = list("select original_name, type, url, size, created_at from actor_documents where actor_id = ? order by created_at", actorId);
            data.put("consultations_de_vos_coordonnees", list("select v.viewed_at as le, coalesce(a.name, 'Agence supprimée') as agence from contact_views v left join agencies a on a.id = v.agency_id where v.actor_id = ? order by v.viewed_at desc", actorId));
            data.put("propositions_de_role", list("select o.kind as type, o.status as statut, o.message, o.audition_date as audition, o.created_at as envoyee_le, o.answered_at as repondue_le, o.answer_note as votre_reponse from role_offers o join shortlist_entries e on e.id = o.entry_id where e.actor_id = ? order by o.created_at desc", actorId));
        }
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        List<String> missing = new ArrayList<>();
        try (ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            List<Map<String, Object>> photoIndex = new ArrayList<>(), docIndex = new ArrayList<>();
            int i = 1;
            for (Map<String, Object> p : photos) {
                String name = String.format("photos/%02d-%s", i++, safe((String) p.get("original_name")));
                photoIndex.add(Map.of("fichier", name, "photo_principale", p.get("is_main"), "ajoutee_le", String.valueOf(p.get("created_at"))));
                if (!put(zip, name, (String) p.get("url"))) missing.add(name);
            }
            i = 1;
            for (Map<String, Object> d : docs) {
                String name = String.format("documents/%02d-%s", i++, safe((String) d.get("original_name")));
                docIndex.add(Map.of("fichier", name, "type", String.valueOf(d.get("type")), "ajoute_le", String.valueOf(d.get("created_at"))));
                if (!put(zip, name, (String) d.get("url"))) missing.add(name);
            }
            data.put("photos", photoIndex);
            data.put("documents", docIndex);
            if (!missing.isEmpty()) data.put("fichiers_non_lus", missing);
            zip.putNextEntry(new ZipEntry("donnees.json"));
            zip.write(JSON.writeValueAsBytes(data));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("LISEZ-MOI.txt"));
            zip.write(("Export de vos données AI Casting.\r\n\r\n"
                    + "donnees.json : votre compte, vos accords, votre fiche, vos consultations et vos propositions de rôle.\r\n"
                    + "photos/ et documents/ : les fichiers que vous avez déposés.\r\n\r\n"
                    + "Pour corriger, mettre en pause ou supprimer vos données : « Mon profil » > « Mes données ».\r\n").getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        audit.log("EXPORT_DONNEES", u.getEmail(), photos.size() + " photo(s), " + docs.size() + " document(s)");
        return bytes.toByteArray();
    }

    // ───────────────────────── Suppression ─────────────────────────

    /** Supprime le compte acteur, sa fiche et ses fichiers. Mot de passe exigé pour un compte e-mail. */
    @Transactional
    public void delete(User u, String password, String confirm) {
        if (u.getRole() != Role.ACTEUR)
            throw new ForbiddenException("Les comptes d'agence et d'administration sont supprimés par l'administrateur de la plateforme.");
        if (!CONFIRM.equals(confirm == null ? null : confirm.trim().toUpperCase(Locale.ROOT)))
            throw new IllegalArgumentException("Tapez « SUPPRIMER » pour confirmer.");
        if ("LOCAL".equals(u.getAuthProvider()) && (password == null || !passwordEncoder.matches(password, u.getPassword())))
            throw new IllegalArgumentException("Mot de passe incorrect.");
        UUID actorId = actorOf(u);
        List<String> keys = new ArrayList<>();
        if (actorId != null) {
            jdbc.query("select url, thumbnail_url from actor_photos where actor_id = ?", rs -> { keys.add(rs.getString(1)); keys.add(rs.getString(2)); }, actorId);
            jdbc.query("select url from actor_documents where actor_id = ?", rs -> { keys.add(rs.getString(1)); }, actorId);
            jdbc.update("delete from actors where id = ?", actorId);               // fiche + photos, documents, langues… (cascade)
        }
        jdbc.update("update actors set created_by = null where created_by = ?", u.getId());
        jdbc.update("delete from users where id = ?", u.getId());                 // accords, sessions, notifications… (cascade)
        // Journal sans donnée personnelle : seule l'adresse masquée est gardée.
        jdbc.update("insert into audit_log (id, actor_id, actor_label, action, target, details) values (?, null, ?, ?, ?, ?)",
                UUID.randomUUID(), "Compte supprimé", "COMPTE_SUPPRIME", PasswordResetService.mask(u.getEmail()),
                "Compte acteur supprimé à sa demande, avec sa fiche et " + keys.stream().filter(Objects::nonNull).count() + " fichier(s)");
        // Les fichiers ne sont effacés qu'une fois la suppression en base validée.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                for (String url : keys) {
                    String key = storage.keyFromUrl(url);
                    if (key == null) continue;
                    try { storage.delete(key); } catch (Exception e) { log.warn("Fichier non effacé : {}", key); }
                }
            }
        });
    }

    // ───────────────────────── Outils ─────────────────────────

    private UUID actorOf(User u) {
        return jdbc.query("select id from actors where user_id = ?", rs -> rs.next() ? (UUID) rs.getObject(1) : null, u.getId());
    }

    private Map<String, Object> one(String sql, Object... args) {
        List<Map<String, Object>> l = list(sql, args);
        return l.isEmpty() ? Map.of() : l.get(0);
    }

    private List<Map<String, Object>> list(String sql, Object... args) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, args);
        rows.forEach(r -> r.replaceAll((k, v) -> v == null ? null : (v instanceof Number || v instanceof Boolean || v instanceof String) ? v : v.toString()));
        return rows;
    }

    private boolean put(ZipOutputStream zip, String name, String url) {
        try {
            String key = storage.keyFromUrl(url);
            if (key == null) return false;
            byte[] b = storage.download(key);
            zip.putNextEntry(new ZipEntry(name));
            zip.write(b);
            zip.closeEntry();
            return true;
        } catch (Exception e) { return false; }
    }

    private static String safe(String name) {
        String n = name == null ? "fichier" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        return n.length() > 80 ? n.substring(n.length() - 80) : n;
    }
}
