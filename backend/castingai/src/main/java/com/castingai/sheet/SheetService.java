package com.castingai.sheet;

import com.castingai.entity.AdRequest;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.ForbiddenException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.live.ActivityClock;
import com.castingai.repository.AdRequestRepository;
import com.castingai.repository.ProjectMemberRepository;
import com.castingai.service.AccessService;
import com.castingai.service.DemandeService;
import com.castingai.service.NotificationService;
import com.castingai.service.V0Reader;
import com.castingai.service.InvitationService;
import com.castingai.storage.StorageService;
import tools.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * P-083 · Fiche unique du projet : une seule source, construite étape par étape.
 * Chaque étape a un propriétaire qui la modifie ; les autres la lisent. L'IA lit les fichiers et liens
 * déposés et remplit : directement les étapes de l'auteur, en propositions celles des autres.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SheetService {

    private final JdbcTemplate jdbc;
    private final AccessService access;
    private final DemandeService demandes;
    private final AdRequestRepository requests;
    private final ProjectMemberRepository members;
    private final NotificationService notifications;
    private final ActivityClock clock;
    private final V0Reader fileReader;
    private final LinkReader linkReader;
    private final SheetAi ai;
    private final SheetAgent agent;
    private final CrewService crew;
    private final StorageService storage;
    private final ObjectMapper json;
    private final org.springframework.transaction.support.TransactionTemplate tx;

    /** Une analyse à la fois : le modèle local occupe la machine. */
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> { Thread t = new Thread(r, "fiche-ia"); t.setDaemon(true); return t; });

    @PreDestroy void stop() { worker.shutdownNow(); }

    /** P-087 · Au démarrage : une lecture coupée par un redémarrage ne reste pas « en cours » pour toujours. */
    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    void unblock() {
        int n = jdbc.update("update project_sheet_sources set status = 'ECHEC', message = 'Lecture interrompue par un redémarrage du serveur : le document reste partagé ; déposez-le à nouveau pour que l''IA le lise.' where status = 'LECTURE'");
        if (n > 0) log.info("{} lecture(s) interrompue(s) marquée(s) en échec", n);
    }

    public record FieldView(String key, String label, String hint, String kind, boolean required, String value, String source,
                            String updatedBy, LocalDateTime updatedAt, String suggestion, String suggestionFrom, boolean canEdit) {}
    public record StageView(String key, int num, String title, String owner, String intro, boolean mine, boolean canEdit, String state,
                            int filled, int total, List<FieldView> fields, List<Line> lines, List<RoleView> roles,
                            String updatedBy, LocalDateTime updatedAt, int suggestions, List<CrewService.CrewView> crew) {}
    public record RoleView(UUID id, String name, String intention, String gender, Integer minAge, Integer maxAge) {}
    public record RoleInput(String name, String intention, String gender, Integer minAge, Integer maxAge) {}
    /** Où en est le dossier, qui a la main, ce qu'il manque, et le bouton de validation pour qui peut le donner. */
    public record Gate(String phase, int phaseIndex, String title, String who, String text, String action, String actionLabel,
                       boolean canAct, List<String> missing, boolean canAskChanges, String feedback, UUID roomId) {}
    public record Step(String comment) {}
    public record Line(String title, String detail) {}
    public record SourceView(UUID id, String kind, String name, String url, String addedBy, LocalDateTime createdAt, String status,
                             String engine, int filled, int proposed, String message, boolean hasFile, String contentType, Long size, boolean canDelete) {}
    public record FileData(byte[] bytes, String name, String type) {}
    public record ShareLink(String path, long expiresAt) {}
    public record Sheet(UUID requestId, UUID projectId, String title, String brandName, String status, int progress,
                        int stagesDone, int stagesTotal, String handStage, String handOwner, boolean canUpload,
                        List<StageView> stages, List<SourceView> sources, Gate gate, List<String> mySides,
                        boolean canManageCrew, int hiddenStages) {}
    public record Value(String value) {}
    public record Link(String url) {}

    // ── Lecture ──

    @Transactional(readOnly = true)
    public Sheet forRequest(String email, UUID id) {
        User me = access.user(email);
        return view(me, readable(me, id));
    }

    @Transactional(readOnly = true)
    public Sheet forRoom(String email, UUID projectId) {
        User me = access.user(email);
        AdRequest r = requests.findFirstByProjectId(projectId).orElseThrow(() -> new ResourceNotFoundException("Cette room n'a pas de fiche"));
        return view(me, readable(me, r.getId()));
    }

    // ── Écriture par le propriétaire de l'étape ──

    @Transactional
    public Sheet update(String email, UUID id, String key, String value) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        SheetSchema.Field f = field(key);
        if (!editable(me, r, f.stage())) throw new ForbiddenException("Cette étape est remplie par : " + SheetSchema.STAGE_BY_KEY.get(f.stage()).owner());
        String v = value == null ? "" : value.trim();
        if (f.kind() == SheetSchema.Kind.DATE && !v.isEmpty()) {
            try { LocalDate.parse(v); } catch (Exception e) { throw new IllegalArgumentException("Date au format AAAA-MM-JJ"); }
        }
        if (f.kind() == SheetSchema.Kind.RANGE && !v.isEmpty()) {
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("^(\\d{4}-\\d{2}-\\d{2})/(\\d{4}-\\d{2}-\\d{2})$").matcher(v);
            try {
                if (!m.matches() || LocalDate.parse(m.group(2)).isBefore(LocalDate.parse(m.group(1)))) throw new IllegalArgumentException();
            } catch (Exception e) { throw new IllegalArgumentException("Choisissez le premier puis le dernier jour dans le calendrier"); }
        }
        if (f.kind() == SheetSchema.Kind.PLANNING && !v.isEmpty()) v = planningJson(v);
        if (v.length() > 8000) throw new IllegalArgumentException("Texte trop long");
        if (f.key().equals("titre") && v.isEmpty()) throw new IllegalArgumentException("Le projet garde un titre");
        write(r.getId(), f, v, "MANUEL", me.getId());
        jdbc.update("update project_sheet_values set suggestion = null, suggestion_from = null, suggestion_at = null where request_id = ? and field_key = ?", r.getId(), f.key());
        return view(me, requests.findById(r.getId()).orElseThrow());
    }

    public record Draft(String text, String engine) {}

    /** Aide à la rédaction : un texte proposé par l'IA pour un champ que la personne peut écrire. Rien n'est enregistré. */
    public Draft propose(String email, UUID id, String key, String current) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        SheetSchema.Field f = field(key);
        if (!editable(me, r, f.stage())) throw new ForbiddenException("Cette étape est remplie par : " + SheetSchema.STAGE_BY_KEY.get(f.stage()).owner());
        if (f.kind() == SheetSchema.Kind.DATE || f.kind() == SheetSchema.Kind.RANGE) throw new IllegalArgumentException("Choisissez la date dans le calendrier");
        if (f.kind() == SheetSchema.Kind.PLANNING) {
            Map<String, String> vals = values(r);
            List<SheetAgent.Step> base = planningBase(vals);
            return agent.planning(vals, base).map(x -> new Draft(agent.toJson(x), "IA")).orElse(new Draft(agent.toJson(base), "REGLES"));
        }
        return ai.draft(f, values(r), current == null ? null : current.trim()).map(t -> new Draft(t, "IA")).orElse(new Draft(null, "AUCUN"));
    }

    @Transactional
    public Sheet accept(String email, UUID id, String key) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        SheetSchema.Field f = field(key);
        if (!editable(me, r, f.stage())) throw new ForbiddenException("Seul le propriétaire de l'étape accepte la proposition");
        String s = jdbc.query("select suggestion from project_sheet_values where request_id = ? and field_key = ?", rs -> rs.next() ? rs.getString(1) : null, r.getId(), f.key());
        if (s == null) throw new IllegalArgumentException("Plus de proposition pour ce champ");
        write(r.getId(), f, s, "IA", me.getId());
        jdbc.update("update project_sheet_values set suggestion = null, suggestion_from = null, suggestion_at = null where request_id = ? and field_key = ?", r.getId(), f.key());
        return view(me, requests.findById(r.getId()).orElseThrow());
    }

    @Transactional
    public Sheet reject(String email, UUID id, String key) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        SheetSchema.Field f = field(key);
        if (!editable(me, r, f.stage())) throw new ForbiddenException("Seul le propriétaire de l'étape écarte la proposition");
        jdbc.update("update project_sheet_values set suggestion = null, suggestion_from = null, suggestion_at = null where request_id = ? and field_key = ?", r.getId(), f.key());
        return view(me, r);
    }

    // ── Fichiers et liens lus par l'IA ──

    @Transactional
    public Sheet addFile(String email, UUID id, MultipartFile file) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        if (sides(me, r).isEmpty()) throw new ForbiddenException("Le dépôt de documents est réservé à la marque, l'agence, la production et la réalisation");
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("Le fichier est vide");
        if (file.getSize() > 25L * 1024 * 1024) throw new IllegalArgumentException("25 Mo au plus");
        String name = Optional.ofNullable(file.getOriginalFilename()).orElse("document").replaceAll("[\\/\\\\]", "_");
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "";
        if (!SHARED.containsKey(ext)) throw new IllegalArgumentException("Formats acceptés : PDF, Word, PowerPoint, Excel, texte, images (JPG, PNG, WebP), vidéo (MP4, MOV)");
        byte[] bytes;
        try { bytes = file.getBytes(); } catch (Exception e) { throw new IllegalArgumentException("Le fichier n'a pas pu être lu"); }
        UUID sid = source(r.getId(), "FICHIER", name, null, me.getId());
        String key = "fiches/" + r.getId() + "/" + sid + "." + ext;
        try { storage.uploadBytes(bytes, key, SHARED.get(ext)); }
        catch (Exception e) { log.warn("Stockage du document impossible : {}", e.toString()); throw new IllegalArgumentException("Le document n'a pas pu être enregistré. Réessayez dans un instant."); }
        jdbc.update("update project_sheet_sources set storage_key = ?, content_type = ?, size_bytes = ? where id = ?", key, SHARED.get(ext), (long) bytes.length, sid);
        UUID rid = r.getId(), uid = me.getId();
        if (Set.of("pdf", "docx", "pptx", "txt", "rtf").contains(ext))
            afterCommit(() -> analyse(sid, rid, uid, () -> new LinkReader.Reading(fileReader.readFull(bytes, name), name, false, null)));
        else finish(sid, "FAIT", null, 0, 0, 0, "Partagé avec l'équipe (ce format n'est pas lu par l'IA).");
        return view(me, r);
    }

    @Transactional
    public Sheet addLink(String email, UUID id, String url) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        if (sides(me, r).isEmpty()) throw new ForbiddenException("Le partage de liens est réservé à la marque, l'agence, la production et la réalisation");
        LinkReader.check(url);   // refus immédiat d'un lien non lisible
        String u = url.trim();
        String name = LinkReader.isCanva(java.net.URI.create(u)) ? "Présentation Canva" : java.net.URI.create(u).getHost();
        UUID sid = source(r.getId(), "LIEN", name, u.length() > 1000 ? u.substring(0, 1000) : u, me.getId());
        UUID rid = r.getId(), uid = me.getId();
        afterCommit(() -> analyse(sid, rid, uid, () -> linkReader.read(u)));
        return view(me, r);
    }

    interface Reader { LinkReader.Reading read(); }

    /** L'analyse démarre une fois la source enregistrée (sinon la tâche de fond ne la trouverait pas). */
    private void afterCommit(Runnable job) {
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive())
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(new org.springframework.transaction.support.TransactionSynchronization() {
                @Override public void afterCommit() { worker.submit(job); }
            });
        else worker.submit(job);
    }

    /** En tâche de fond : lire, extraire, remplir ou proposer, prévenir, puis réveiller les pages ouvertes. */
    void analyse(UUID sourceId, UUID requestId, UUID uploaderId, Reader reader) {
        try {
            LinkReader.Reading reading = reader.read();
            String text = reading.text();
            if (text == null || text.isBlank()) { finish(sourceId, "ECHEC", null, 0, 0, 0, "Aucun texte lisible dans ce document (texte en image ?). Il reste partagé avec l'équipe ; pour l'IA, déposez un PDF avec du texte."); return; }
            SheetAi.Extraction ex = agent.extract(text, msg -> jdbc.update("update project_sheet_sources set message = ? where id = ? and status = 'LECTURE'", msg, sourceId));
            tx.executeWithoutResult(st -> apply(sourceId, requestId, uploaderId, reading, text, ex));
        } catch (IllegalArgumentException e) {
            finish(sourceId, "ECHEC", null, 0, 0, 0, e.getMessage());
        } catch (Exception e) {
            log.warn("Analyse de la fiche impossible : {}", e.toString());
            finish(sourceId, "ECHEC", null, 0, 0, 0, "La lecture a échoué. Réessayez, ou déposez le document en PDF.");
        } finally {
            clock.tick(null);   // les pages ouvertes se mettent à jour
        }
    }

    /** Remplit ou propose, dans une transaction (le projet et l'auteur sont relus). */
    private void apply(UUID sourceId, UUID requestId, UUID uploaderId, LinkReader.Reading reading, String text, SheetAi.Extraction ex) {
        {
            AdRequest r = requests.findById(requestId).orElse(null);
            User uploader = uploaderId == null ? null : access.userById(uploaderId);
            if (r == null || uploader == null) return;
            Map<String, String> current = values(r);
            Set<String> mine = sides(uploader, r);
            int filled = 0, proposed = 0;
            Map<String, Integer> perStage = new LinkedHashMap<>();
            for (var e : ex.values().entrySet()) {
                SheetSchema.Field f = SheetSchema.BY_KEY.get(e.getKey());
                if (f == null) continue;
                String now = current.getOrDefault(f.key(), "");
                if (now.equalsIgnoreCase(e.getValue().trim())) continue;
                boolean own = !Collections.disjoint(mine, SheetSchema.STAGE_BY_KEY.get(f.stage()).sides()) || uploader.getRole() == Role.ADMIN;
                if (own && now.isBlank()) { write(requestId, f, e.getValue(), "IA", uploaderId); filled++; }
                else {
                    jdbc.update("""
                        insert into project_sheet_values (request_id, field_key, suggestion, suggestion_from, suggestion_at) values (?, ?, ?, ?, now())
                        on conflict (request_id, field_key) do update set suggestion = excluded.suggestion, suggestion_from = excluded.suggestion_from, suggestion_at = now()""",
                        requestId, f.key(), e.getValue(), uploaderId);
                    proposed++;
                    if (!own) perStage.merge(f.stage(), 1, Integer::sum);
                }
            }
            String who = (uploader.getFirstName() + " " + uploader.getLastName()).trim();
            for (var e : perStage.entrySet()) {
                SheetSchema.Stage st = SheetSchema.STAGE_BY_KEY.get(e.getKey());
                for (UUID u : owners(r, st))
                    if (!u.equals(uploaderId)) notifications.push(u, "TOUR", "À vous : l'IA a pré-rempli « " + st.title() + " », " + r.getTitle(),
                            who + " a déposé un document. " + e.getValue() + " champ(s) vous attendent : acceptez-les en un clic ou corrigez-les.", "/demandes/" + requestId + "#etape-" + st.key());
            }
            String msg = reading.message() != null ? reading.message()
                    : filled + proposed == 0 ? "L'IA n'a trouvé aucun champ de la fiche dans ce document."
                    : (ex.engine().equals("REGLES") ? "L'IA locale ne répondait pas : seules les rubriques étiquetées (« Cible : … ») ont été lues." : null);
            finish(sourceId, "FAIT", ex.engine(), text.length(), filled, proposed, msg);
        }
    }

    private void finish(UUID id, String status, String engine, int chars, int filled, int proposed, String message) {
        jdbc.update("update project_sheet_sources set status = ?, engine = ?, chars = ?, filled = ?, proposed = ?, message = ? where id = ?",
                status, engine, chars, filled, proposed, message == null ? null : message.length() > 1000 ? message.substring(0, 1000) : message, id);
    }

    private UUID source(UUID requestId, String kind, String name, String url, UUID by) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into project_sheet_sources (id, request_id, kind, name, url, added_by) values (?, ?, ?, ?, ?, ?)",
                id, requestId, kind, name.length() > 300 ? name.substring(0, 300) : name, url, by);
        return id;
    }

    // ── Phases du dossier ──

    /** La phase en cours et sa validation. Le producer peut tout faire, sauf valider à la place de la marque. */
    private Gate gate(AdRequest r, Set<String> sides, Map<String, String> vals, List<StageView> stages) {
        boolean prod = sides.contains("PROD"), brand = sides.contains("MARQUE"), agency = sides.contains("AGENCE"), real = sides.contains("REAL");
        String agencyName = r.getAgency() == null ? "l'agence" : r.getAgency().getName();
        UUID room = r.getProject() == null ? null : r.getProject().getId();
        String feedback = lastFeedback(r);
        return switch (r.getStatus()) {
            case BROUILLON -> {
                List<String> miss = missing(vals, "brief");
                if (r.getAgency() == null) miss.add(0, "Inviter l'agence marketing");
                yield new Gate("brief", 0, "Le brief", "La marque, avec le producer",
                        "La marque rédige le brief ; le producer peut le compléter. Une fois prêt, il part chez " + agencyName + ".",
                        "transmettre", "Transmettre le brief à l'agence", brand || prod, miss, false, null, room);
            }
            case V0_ENVOYEE, V1_EN_COURS -> new Gate("recommandation", 1, "La recommandation créative", "L'agence marketing",
                    agencyName + " rédige sa recommandation créative dans le dossier, puis la présente à la marque.",
                    "presenter", "Présenter la recommandation à la marque", agency || prod, missing(vals, "concept"), false, feedback, room);
            case V1_LIVREE -> r.getV1ValidatedAt() == null
                    ? new Gate("validation", 1, "La validation de la marque", "La marque",
                        "La recommandation est présentée. La marque la valide, ou demande des modifications à l'agence.",
                        "valider", "Valider la recommandation", brand, List.of(), brand, null, room)
                    : new Gate("preparation", 2, "La préparation", "Le producer",
                        "La recommandation est validée. Le producer prépare le tournage.", null, null, false, List.of(), false, null, room);
            case V2_EN_COURS -> {
                List<String> miss = new ArrayList<>();
                StageView roles = stages.stream().filter(x -> x.key().equals("roles")).findFirst().orElse(null);
                if (roles == null || roles.roles().isEmpty()) miss.add("Au moins un rôle à caster");
                else roles.roles().stream().filter(x -> x.intention() == null || x.intention().isBlank()).forEach(x -> miss.add("L'intention du rôle « " + x.name() + " »"));
                yield new Gate("preparation", 2, "La préparation", "Le producer et la réalisation",
                        "Le réalisateur écrit sa note d'intention et les rôles ; le producer organise le tournage. Quand les rôles sont prêts, le casting s'ouvre dans la room.",
                        "lancer", "Lancer le casting", prod || real, miss, false, null, room);
            }
            case V2_LIVREE, CASTING, PPM, ACTEURS_VALIDES -> new Gate("casting", 3, "Le casting", "Toute l'équipe",
                    "Le casting se déroule dans la room : swipe, résultats, auditions, jusqu'à la PPM.", null, null, false, List.of(), false, null, room);
            case CLOTUREE -> new Gate("fin", 4, "Projet clôturé", "", "Le film est terminé.", null, null, false, List.of(), false, null, room);
            case ANNULEE -> new Gate("annule", 0, "Projet annulé", "", "Ce projet a été annulé.", null, null, false, List.of(), false, null, room);
        };
    }

    private static List<String> missing(Map<String, String> vals, String stage) {
        List<String> m = new ArrayList<>();
        for (SheetSchema.Field f : SheetSchema.fieldsOf(stage)) if (f.required() && (vals.get(f.key()) == null || vals.get(f.key()).isBlank())) m.add(f.label());
        return m;
    }

    /** Le dernier retour de la marque, tant que la recommandation n'a pas été représentée. */
    private String lastFeedback(AdRequest r) {
        return jdbc.query("select type, message from ad_events where request_id = ? and type in ('RECO_A_REVOIR', 'V1_REVISION', 'RECO_PRESENTEE', 'V1_LIVREE') order by created_at desc limit 1",
            rs -> {
                if (!rs.next()) return null;
                String t = rs.getString(1);
                return t.equals("RECO_A_REVOIR") || t.equals("V1_REVISION") ? rs.getString(2) : null;
            }, r.getId());
    }

    /** Passer à la phase suivante : transmettre, présenter, valider, demander des modifications, lancer le casting. */
    @Transactional
    public Sheet step(String email, UUID id, String action, String comment) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        Set<String> s = sides(me, r);
        switch (action) {
            case "transmettre" -> {
                if (!s.contains("MARQUE") && !s.contains("PROD")) throw new ForbiddenException("La marque ou le producer transmet le brief");
                List<String> miss = missing(values(r), "brief");
                if (!miss.isEmpty()) throw new IllegalArgumentException("Complétez d'abord le brief : " + String.join(", ", miss));
                demandes.dossierSendBrief(me, r);
            }
            case "presenter" -> {
                if (!s.contains("AGENCE") && !s.contains("PROD")) throw new ForbiddenException("L'agence ou le producer présente la recommandation");
                List<String> miss = missing(values(r), "concept");
                if (!miss.isEmpty()) throw new IllegalArgumentException("Complétez d'abord la recommandation : " + String.join(", ", miss));
                if (r.getStatus() == AdRequest.Status.V0_ENVOYEE) r.setStatus(AdRequest.Status.V1_EN_COURS);
                demandes.dossierPresentReco(me, r);
            }
            case "valider" -> {
                if (!s.contains("MARQUE")) throw new ForbiddenException("Seule la marque valide la recommandation");
                demandes.dossierValidateReco(me, r);
            }
            case "modifier" -> {
                if (!s.contains("MARQUE")) throw new ForbiddenException("Seule la marque demande des modifications");
                demandes.dossierAskChanges(me, r, comment);
                jdbc.update("insert into demande_comments (id, request_id, author_id, body) values (?, ?, ?, ?)",
                        UUID.randomUUID(), r.getId(), me.getId(), "Modifications demandées sur la recommandation : " + comment.trim());
            }
            case "lancer" -> {
                if (!s.contains("PROD") && !s.contains("REAL")) throw new ForbiddenException("Le producer ou la réalisation lance le casting");
                demandes.dossierLaunchCasting(me, r);
            }
            default -> throw new ResourceNotFoundException("Étape inconnue");
        }
        requests.save(r);
        return view(me, requests.findById(r.getId()).orElseThrow());
    }

    // ── Rôles à caster, écrits dans le dossier ──

    private List<RoleView> roles(UUID requestId) {
        return jdbc.query("select id, name, intention, gender, min_age, max_age from ad_roles where request_id = ? order by position, created_at",
                (rs, i) -> new RoleView((UUID) rs.getObject(1), rs.getString(2), rs.getString(3), rs.getString(4),
                        (Integer) rs.getObject(5), (Integer) rs.getObject(6)), requestId);
    }

    private AdRequest rolesEditable(User me, UUID id) {
        AdRequest r = readable(me, id);
        if (!editable(me, r, "roles")) throw new ForbiddenException("Les rôles sont écrits par la réalisation ou le producer");
        if (r.getV2PublishedAt() != null) throw new IllegalArgumentException("Le casting est lancé : les rôles se gèrent dans la room");
        return r;
    }

    private static void check(RoleInput in) {
        if (in == null || in.name() == null || in.name().isBlank()) throw new IllegalArgumentException("Donnez un nom au rôle");
        if (in.name().length() > 120) throw new IllegalArgumentException("120 caractères au plus pour le nom");
        if (in.gender() != null && !in.gender().isBlank() && !Set.of("Femme", "Homme").contains(in.gender())) throw new IllegalArgumentException("Sexe : Femme, Homme ou indifférent");
        for (Integer a : new Integer[]{ in.minAge(), in.maxAge() }) if (a != null && (a < 0 || a > 100)) throw new IllegalArgumentException("Âge entre 0 et 100");
        if (in.minAge() != null && in.maxAge() != null && in.minAge() > in.maxAge()) throw new IllegalArgumentException("L'âge minimum dépasse l'âge maximum");
    }

    @Transactional
    public Sheet addRole(String email, UUID id, RoleInput in) {
        User me = access.user(email);
        AdRequest r = rolesEditable(me, id);
        check(in);
        Integer pos = jdbc.queryForObject("select coalesce(max(position), -1) + 1 from ad_roles where request_id = ?", Integer.class, r.getId());
        jdbc.update("insert into ad_roles (id, request_id, position, name, intention, gender, min_age, max_age) values (?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), r.getId(), pos, in.name().trim(), blank(in.intention()), blank(in.gender()), in.minAge(), in.maxAge());
        jdbc.update("update ad_requests set updated_at = now() where id = ?", r.getId());
        return view(me, r);
    }

    @Transactional
    public Sheet updateRole(String email, UUID id, UUID roleId, RoleInput in) {
        User me = access.user(email);
        AdRequest r = rolesEditable(me, id);
        check(in);
        int n = jdbc.update("update ad_roles set name = ?, intention = ?, gender = ?, min_age = ?, max_age = ? where id = ? and request_id = ?",
                in.name().trim(), blank(in.intention()), blank(in.gender()), in.minAge(), in.maxAge(), roleId, r.getId());
        if (n == 0) throw new ResourceNotFoundException("Rôle introuvable");
        jdbc.update("update ad_requests set updated_at = now() where id = ?", r.getId());
        return view(me, r);
    }

    @Transactional
    public Sheet deleteRole(String email, UUID id, UUID roleId) {
        User me = access.user(email);
        AdRequest r = rolesEditable(me, id);
        jdbc.update("delete from ad_roles where id = ? and request_id = ?", roleId, r.getId());
        jdbc.update("update ad_requests set updated_at = now() where id = ?", r.getId());
        return view(me, r);
    }

    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }


    // ── P-087 · Documents et liens : voir, télécharger, partager, retirer ──

    static final Map<String, String> SHARED = Map.ofEntries(
        Map.entry("pdf", "application/pdf"), Map.entry("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        Map.entry("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        Map.entry("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), Map.entry("txt", "text/plain"),
        Map.entry("rtf", "application/rtf"), Map.entry("csv", "text/csv"), Map.entry("jpg", "image/jpeg"), Map.entry("jpeg", "image/jpeg"),
        Map.entry("png", "image/png"), Map.entry("webp", "image/webp"), Map.entry("mp4", "video/mp4"), Map.entry("mov", "video/quicktime"));
    static final int SHARE_DAYS = 7;

    @Transactional(readOnly = true)
    public FileData file(String email, UUID id, UUID sourceId) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        return load(r.getId(), sourceId);
    }

    /** Un lien de partage du fichier, valable {@value #SHARE_DAYS} jours, que l'on peut envoyer par WhatsApp ou e-mail. */
    @Transactional
    public ShareLink share(String email, UUID id, UUID sourceId) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        load(r.getId(), sourceId);   // le fichier existe et appartient au projet
        byte[] raw = new byte[24];
        new java.security.SecureRandom().nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        Timestamp until = Timestamp.valueOf(LocalDateTime.now().plusDays(SHARE_DAYS));
        jdbc.update("insert into sheet_shares (token_hash, source_id, created_by, expires_at) values (?, ?, ?, ?)", InvitationService.hash(token), sourceId, me.getId(), until);
        return new ShareLink("/api/public/fichiers/" + token, until.getTime());
    }

    @Transactional(readOnly = true)
    public FileData shared(String token) {
        if (token == null || token.length() < 20 || token.length() > 100) throw new ResourceNotFoundException("Ce lien de partage n'est plus valable");
        var rows = jdbc.queryForList("select s.source_id, p.request_id from sheet_shares s join project_sheet_sources p on p.id = s.source_id where s.token_hash = ? and s.expires_at > now()", InvitationService.hash(token));
        if (rows.isEmpty()) throw new ResourceNotFoundException("Ce lien de partage a expiré : demandez un nouveau lien à l'équipe du projet");
        return load((UUID) rows.get(0).get("request_id"), (UUID) rows.get(0).get("source_id"));
    }

    @Transactional
    public Sheet deleteSource(String email, UUID id, UUID sourceId) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        var rows = jdbc.queryForList("select added_by, storage_key from project_sheet_sources where id = ? and request_id = ?", sourceId, r.getId());
        if (rows.isEmpty()) throw new ResourceNotFoundException("Document introuvable");
        if (!sides(me, r).contains("PROD") && !me.getId().equals(rows.get(0).get("added_by"))) throw new ForbiddenException("Seuls la production et l'auteur du dépôt le retirent");
        String key = (String) rows.get(0).get("storage_key");
        jdbc.update("delete from project_sheet_sources where id = ?", sourceId);
        if (key != null) try { storage.delete(key); } catch (Exception e) { log.warn("Fichier non retiré du stockage : {}", e.toString()); }
        clock.tick(null);
        return view(me, r);
    }

    private FileData load(UUID requestId, UUID sourceId) {
        var rows = jdbc.queryForList("select name, storage_key, content_type from project_sheet_sources where id = ? and request_id = ?", sourceId, requestId);
        if (rows.isEmpty() || rows.get(0).get("storage_key") == null) throw new ResourceNotFoundException("Ce document n'est pas conservé (déposé avant la mise à jour) : déposez-le à nouveau");
        try { return new FileData(storage.download((String) rows.get(0).get("storage_key")), (String) rows.get(0).get("name"), (String) rows.get(0).get("content_type")); }
        catch (Exception e) { throw new ResourceNotFoundException("Le document est momentanément indisponible"); }
    }

    // ── P-087 · Équipe technique ──

    @Transactional
    public Sheet saveCrew(String email, UUID id, String post, CrewService.Contact c) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        crew.save(me, r, post, c, editable(me, r, "production"));
        return view(me, r);
    }

    @Transactional
    public Sheet clearCrew(String email, UUID id, String post) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        if (!editable(me, r, "production")) throw new ForbiddenException("L'équipe technique est gérée par le producer et la réalisation");
        crew.clear(me, r, post);
        return view(me, r);
    }

    @Transactional
    public CrewService.Invite inviteCrew(String email, UUID id, String post, CrewService.Contact c) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        if (!editable(me, r, "production")) throw new ForbiddenException("L'équipe technique est gérée par le producer et la réalisation");
        return crew.invite(me, r, post, c);
    }

    // ── P-087 · Planning ──

    /** Le planning : une liste d'étapes datées, vérifiée et rangée dans l'ordre. Un ancien texte libre est refusé. */
    String planningJson(String v) {
        List<?> list;
        try { list = json.readValue(v, List.class); } catch (Exception e) { throw new IllegalArgumentException("Planning illisible"); }
        if (list.size() > 30) throw new IllegalArgumentException("30 étapes au plus");
        List<SheetAgent.Step> out = new ArrayList<>();
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) throw new IllegalArgumentException("Planning illisible");
            String et = m.get("etape") == null ? "" : String.valueOf(m.get("etape")).trim();
            if (et.isEmpty()) throw new IllegalArgumentException("Chaque étape a un nom");
            LocalDate a, b;
            try { a = LocalDate.parse(String.valueOf(m.get("debut"))); b = m.get("fin") == null || String.valueOf(m.get("fin")).isBlank() ? a : LocalDate.parse(String.valueOf(m.get("fin"))); }
            catch (Exception e) { throw new IllegalArgumentException("« " + et + " » : choisissez les dates dans le calendrier"); }
            if (b.isBefore(a)) throw new IllegalArgumentException("« " + et + " » : la fin est avant le début");
            String qui = m.get("qui") == null ? "" : String.valueOf(m.get("qui")).trim(), note = m.get("note") == null ? "" : String.valueOf(m.get("note")).trim();
            out.add(new SheetAgent.Step(et.length() > 80 ? et.substring(0, 80) : et, a.toString(), b.toString(), qui.length() > 40 ? qui.substring(0, 40) : qui, note.length() > 200 ? note.substring(0, 200) : note));
        }
        out.sort(Comparator.comparing(SheetAgent.Step::debut).thenComparing(SheetAgent.Step::fin));
        return agent.toJson(out);
    }

    private List<SheetAgent.Step> planningBase(Map<String, String> vals) {
        LocalDate s = null, e = null, d = null;
        String range = vals.get("dates_tournage");
        if (range != null && range.matches("\\d{4}-\\d{2}-\\d{2}/\\d{4}-\\d{2}-\\d{2}")) { s = LocalDate.parse(range.substring(0, 10)); e = LocalDate.parse(range.substring(11)); }
        try { if (vals.get("diffusion") != null) d = LocalDate.parse(vals.get("diffusion").substring(0, 10)); } catch (Exception ignored) { }
        if (s == null && d == null) throw new IllegalArgumentException("Fixez d'abord les dates de tournage ou la date de diffusion : le planning se construit à partir d'elles");
        if (s == null) { s = SheetAgent.until(d.minusDays(26)); e = s.plusDays(1); }
        return SheetAgent.baseline(s, e, d);
    }

    // ── P-087 · Qui voit quel chapitre ──

    /** Production, réalisation : tout. Marque et agence : tout le dossier. Équipe technique : la préparation et le tournage. */
    private Set<String> stagesFor(User me, AdRequest r, Set<String> mySides) {
        Set<String> all = new LinkedHashSet<>();
        SheetSchema.STAGES.forEach(x -> all.add(x.key()));
        if (!mySides.isEmpty() || me.getRole() == Role.ADMIN) return all;
        if (crew.isCrew(me, r.getId())) return Set.of("concept", "realisation", "production", "roles", "casting");
        return Set.of("brief", "concept", "realisation", "production", "roles", "casting");
    }

    /** Le chapitre a-t-il déjà du contenu ? */
    private static boolean started(StageView x) {
        return x.filled() > 0 || x.fields().stream().anyMatch(f -> f.value() != null && !f.value().isBlank())
                || !x.roles().isEmpty() || !x.lines().isEmpty() || x.crew().stream().anyMatch(c -> !"A_POURVOIR".equals(c.status()));
    }

    // ── Droits ──

    /** Les côtés de l'utilisateur sur ce projet : PROD, MARQUE, AGENCE, REAL. */
    Set<String> sides(User me, AdRequest r) {
        Set<String> s = new HashSet<>();
        if (me.getRole() == Role.ADMIN) return Set.of("PROD", "MARQUE", "AGENCE", "REAL");
        UUID org = me.getAgency() == null ? null : me.getAgency().getId();
        if (org != null && r.getProduction() != null && org.equals(r.getProduction().getId())
                && (me.getRole() == Role.BOITE_PROD || (me.getRole() == Role.ASSISTANT_PROD && me.can("PROJETS")))) s.add("PROD");
        if (org != null && r.getBrand() != null && org.equals(r.getBrand().getId()) && me.getRole() == Role.MARQUE) s.add("MARQUE");
        if (org != null && r.getAgency() != null && org.equals(r.getAgency().getId()) && me.getRole() == Role.AGENCE_MARKETING) s.add("AGENCE");
        if ((r.getDirector() != null && r.getDirector().getId().equals(me.getId())) || (r.getFirstAd() != null && r.getFirstAd().getId().equals(me.getId()))) s.add("REAL");
        return s;
    }

    boolean editable(User me, AdRequest r, String stage) {
        SheetSchema.Stage st = SheetSchema.STAGE_BY_KEY.get(stage);
        if (st == null || st.auto() || r.getStatus() == AdRequest.Status.ANNULEE) return false;
        return !Collections.disjoint(sides(me, r), st.sides());
    }

    /** Toute personne qui voit la demande, ou membre de sa room. */
    private AdRequest readable(User me, UUID id) {
        try { return demandes.visibleTo(me, id); }
        catch (ResourceNotFoundException e) {
            AdRequest r = requests.findById(id).orElseThrow(() -> e);
            if (r.getProject() != null && members.existsByProjectIdAndUserId(r.getProject().getId(), me.getId())) return r;
            if (crew.isCrew(me, r.getId())) return r;
            throw e;
        }
    }

    private List<UUID> owners(AdRequest r, SheetSchema.Stage st) {
        List<UUID> out = new ArrayList<>();
        for (String side : st.sides()) switch (side) {
            case "PROD" -> { if (r.getProduction() != null) out.addAll(jdbc.queryForList("select id from users where agency_id = ? and enabled = true and role in ('BOITE_PROD','ASSISTANT_PROD')", UUID.class, r.getProduction().getId())); }
            case "MARQUE" -> { if (r.getBrand() != null) out.addAll(jdbc.queryForList("select id from users where agency_id = ? and enabled = true and role = 'MARQUE'", UUID.class, r.getBrand().getId())); }
            case "AGENCE" -> { if (r.getAgency() != null) out.addAll(jdbc.queryForList("select id from users where agency_id = ? and enabled = true and role = 'AGENCE_MARKETING'", UUID.class, r.getAgency().getId())); }
            case "REAL" -> { if (r.getDirector() != null) out.add(r.getDirector().getId()); if (r.getFirstAd() != null) out.add(r.getFirstAd().getId()); }
            default -> { }
        }
        return out;
    }

    // ── Valeurs ──

    private static SheetSchema.Field field(String key) {
        SheetSchema.Field f = SheetSchema.BY_KEY.get(key);
        if (f == null) throw new ResourceNotFoundException("Champ inconnu");
        return f;
    }

    /** Les champs déjà portés par la demande restent dans la demande : une seule source de vérité. */
    private void write(UUID requestId, SheetSchema.Field f, String v, String source, UUID by) {
        if (f.column() != null) {
            Object val = f.kind() == SheetSchema.Kind.DATE ? (v.isEmpty() ? null : java.sql.Date.valueOf(LocalDate.parse(v))) : (v.isEmpty() ? null : v);
            jdbc.update("update ad_requests set " + f.column() + " = ?, updated_at = now() where id = ?", val, requestId);
        } else {
            jdbc.update("update ad_requests set updated_at = now() where id = ?", requestId);
        }
        jdbc.update("""
            insert into project_sheet_values (request_id, field_key, value, source, updated_by, updated_at) values (?, ?, ?, ?, ?, now())
            on conflict (request_id, field_key) do update set value = excluded.value, source = excluded.source, updated_by = excluded.updated_by, updated_at = now()""",
            requestId, f.key(), f.column() != null ? null : (v.isEmpty() ? null : v), source, by);
    }

    private Map<String, String> values(AdRequest r) {
        Map<String, String> m = new HashMap<>();
        Map<String, Object> cols = jdbc.queryForMap("select title, product, air_date, objective, target, key_message from ad_requests where id = ?", r.getId());
        for (SheetSchema.Field f : SheetSchema.FIELDS) if (f.column() != null) { Object o = cols.get(f.column()); if (o != null) m.put(f.key(), o.toString()); }
        jdbc.query("select field_key, value from project_sheet_values where request_id = ? and value is not null", rs -> { m.putIfAbsent(rs.getString(1), rs.getString(2)); }, r.getId());
        return m;
    }

    private record Meta(String source, String by, LocalDateTime at, String suggestion, String suggestionFrom) {}

    private Sheet view(User me, AdRequest r) {
        Map<String, String> vals = values(r);
        Map<String, Meta> meta = new HashMap<>();
        jdbc.query("""
            select v.field_key, v.source, coalesce(u.first_name || ' ' || u.last_name, null), v.updated_at, v.suggestion, coalesce(s.first_name || ' ' || s.last_name, null), v.value is not null or v.source = 'IA'
              from project_sheet_values v left join users u on u.id = v.updated_by left join users s on s.id = v.suggestion_from
             where v.request_id = ?""", rs -> {
                Timestamp t = rs.getTimestamp(4);
                meta.put(rs.getString(1), new Meta(rs.getString(2), rs.getString(3), t == null ? null : t.toLocalDateTime(), rs.getString(5), rs.getString(6)));
            }, r.getId());
        Set<String> mySides = sides(me, r);
        List<StageView> stages = new ArrayList<>();
        int done = 0;
        String hand = null, handOwner = null;
        for (SheetSchema.Stage st : SheetSchema.STAGES) {
            boolean can = editable(me, r, st.key());
            boolean mine = !Collections.disjoint(mySides, st.sides());
            List<FieldView> fields = new ArrayList<>();
            List<Line> lines = new ArrayList<>();
            int filled = 0, total = 0, sugg = 0;
            String lastBy = null; LocalDateTime lastAt = null;
            List<RoleView> roles = new ArrayList<>();
            if (st.key().equals("roles")) {
                roles.addAll(roles(r.getId()));
                can = can && r.getV2PublishedAt() == null;   // une fois le casting lancé, les rôles vivent dans la room
                total = 1; filled = !roles.isEmpty() && roles.stream().allMatch(x -> x.intention() != null && !x.intention().isBlank()) ? 1 : 0;
            } else if (!st.auto()) {
                for (SheetSchema.Field f : SheetSchema.fieldsOf(st.key())) {
                    String v = vals.get(f.key());
                    Meta m = meta.get(f.key());
                    boolean has = v != null && !v.isBlank();
                    if (f.required()) { total++; if (has) filled++; }
                    if (m != null && m.suggestion() != null) sugg++;
                    if (m != null && m.at() != null && has && (lastAt == null || m.at().isAfter(lastAt))) { lastAt = m.at(); lastBy = m.by(); }
                    fields.add(new FieldView(f.key(), f.label(), f.hint(), f.kind().name(), f.required(), v,
                            m == null ? (has ? "MANUEL" : null) : m.source(), m == null ? null : m.by(), m == null ? null : m.at(),
                            m == null ? null : m.suggestion(), m == null ? null : m.suggestionFrom(), can));
                }
            } else {
                if (r.getProject() != null) jdbc.query("""
                    select cr.name, count(e.id), count(e.id) filter (where e.status in ('AUDITION','RAPPEL')), count(e.id) filter (where e.status = 'CHOISI')
                      from casting_roles cr left join shortlist_entries e on e.role_id = cr.id
                     where cr.project_id = ? group by cr.name, cr.created_at order by cr.created_at""", rs -> {
                    lines.add(new Line(rs.getString(1), rs.getInt(2) + " candidat(s) · " + rs.getInt(3) + " en audition · " + (rs.getInt(4) > 0 ? rs.getInt(4) + " choisi(s)" : "personne de choisi")));
                }, r.getProject().getId());
                total = Math.max(1, lines.size());
                filled = (int) lines.stream().filter(l -> !l.detail().endsWith("personne de choisi")).count();
            }
            String state = total > 0 && filled >= total ? "complete" : filled > 0 ? "encours" : "vide";
            if (state.equals("complete")) done++;
            else if (hand == null) { hand = st.key(); handOwner = st.owner(); }
            List<CrewService.CrewView> team = st.key().equals("production") ? crew.list(me, r, mySides.contains("PROD") || mySides.contains("REAL")) : List.of();
            stages.add(new StageView(st.key(), st.num(), st.title(), st.owner(), st.intro(), mine, can, state, filled, total, fields, lines, roles, lastBy, lastAt, sugg, team));
        }
        int req = 0, got = 0;
        for (StageView s : stages) { req += s.total(); got += Math.min(s.filled(), s.total()); }
        List<SourceView> sources = jdbc.query("""
            select s.id, s.kind, s.name, s.url, coalesce(u.first_name || ' ' || u.last_name, null), s.created_at, s.status, s.engine, s.filled, s.proposed, s.message,
                   s.storage_key is not null, s.content_type, s.size_bytes, s.added_by
              from project_sheet_sources s left join users u on u.id = s.added_by where s.request_id = ? order by s.created_at desc limit 50""",
            (rs, i) -> new SourceView((UUID) rs.getObject(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
                    rs.getTimestamp(6).toLocalDateTime(), rs.getString(7), rs.getString(8), rs.getInt(9), rs.getInt(10), rs.getString(11),
                    rs.getBoolean(12), rs.getString(13), (Long) rs.getObject(14),
                    mySides.contains("PROD") || me.getId().equals(rs.getObject(15))), r.getId());
        // P-087 · Chacun voit ses chapitres à remplir et ceux des autres déjà commencés, selon son rôle
        Set<String> allowed = stagesFor(me, r, mySides);
        List<StageView> shown = stages.stream().filter(x -> allowed.contains(x.key()) && (x.canEdit() || started(x) || SheetSchema.STAGE_BY_KEY.get(x.key()).auto())).toList();
        int hidden = stages.size() - shown.size();
        return new Sheet(r.getId(), r.getProject() == null ? null : r.getProject().getId(), r.getTitle(),
                r.getBrand() == null ? null : r.getBrand().getName(), r.getStatus().name(),
                req == 0 ? 0 : Math.round(got * 100f / req), done, stages.size(), hand, handOwner, !mySides.isEmpty(), shown, sources,
                gate(r, mySides, vals, stages), List.copyOf(mySides), mySides.contains("PROD") || mySides.contains("REAL"), hidden);
    }
}
