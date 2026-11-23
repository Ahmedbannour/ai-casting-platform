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
    private final org.springframework.transaction.support.TransactionTemplate tx;

    /** Une analyse à la fois : le modèle local occupe la machine. */
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> { Thread t = new Thread(r, "fiche-ia"); t.setDaemon(true); return t; });

    @PreDestroy void stop() { worker.shutdownNow(); }

    public record FieldView(String key, String label, String hint, String kind, boolean required, String value, String source,
                            String updatedBy, LocalDateTime updatedAt, String suggestion, String suggestionFrom, boolean canEdit) {}
    public record StageView(String key, int num, String title, String owner, String intro, boolean mine, boolean canEdit, String state,
                            int filled, int total, List<FieldView> fields, List<Line> lines, String updatedBy, LocalDateTime updatedAt, int suggestions) {}
    public record Line(String title, String detail) {}
    public record SourceView(UUID id, String kind, String name, String url, String addedBy, LocalDateTime createdAt, String status,
                             String engine, int filled, int proposed, String message) {}
    public record Sheet(UUID requestId, UUID projectId, String title, String brandName, String status, int progress,
                        int stagesDone, int stagesTotal, String handStage, String handOwner, boolean canUpload,
                        List<StageView> stages, List<SourceView> sources) {}
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
        if (v.length() > 4000) throw new IllegalArgumentException("4 000 caractères au plus");
        if (f.key().equals("titre") && v.isEmpty()) throw new IllegalArgumentException("Le projet garde un titre");
        write(r.getId(), f, v, "MANUEL", me.getId());
        jdbc.update("update project_sheet_values set suggestion = null, suggestion_from = null, suggestion_at = null where request_id = ? and field_key = ?", r.getId(), f.key());
        return view(me, requests.findById(r.getId()).orElseThrow());
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
        if (sides(me, r).isEmpty()) throw new ForbiddenException("Seuls les membres qui remplissent la fiche y déposent des documents");
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("Le fichier est vide");
        if (file.getSize() > 25L * 1024 * 1024) throw new IllegalArgumentException("25 Mo au plus");
        String name = Optional.ofNullable(file.getOriginalFilename()).orElse("document");
        String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase() : "";
        if (!Set.of("pdf", "docx", "pptx", "txt", "rtf").contains(ext)) throw new IllegalArgumentException("Formats lus par l'IA : PDF, Word (.docx), PowerPoint (.pptx), texte");
        byte[] bytes;
        try { bytes = file.getBytes(); } catch (Exception e) { throw new IllegalArgumentException("Le fichier n'a pas pu être lu"); }
        UUID sid = source(r.getId(), "FICHIER", name, null, me.getId());
        UUID rid = r.getId(), uid = me.getId();
        afterCommit(() -> analyse(sid, rid, uid, () -> new LinkReader.Reading(fileReader.read(bytes, name), name, false, null)));
        return view(me, r);
    }

    @Transactional
    public Sheet addLink(String email, UUID id, String url) {
        User me = access.user(email);
        AdRequest r = readable(me, id);
        if (sides(me, r).isEmpty()) throw new ForbiddenException("Seuls les membres qui remplissent la fiche y déposent des liens");
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
            if (text == null || text.isBlank()) { finish(sourceId, "ECHEC", null, 0, 0, 0, "Aucun texte lisible dans ce document. Est-ce une image ? Déposez un PDF avec du texte."); return; }
            SheetAi.Extraction ex = ai.extract(text);
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
                            who + " a déposé un document. " + e.getValue() + " champ(s) vous attendent : acceptez-les en un clic ou corrigez-les.", "/demandes/" + requestId + "/fiche#etape-" + st.key());
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
            if (!st.auto()) {
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
            } else if (st.key().equals("roles")) {
                jdbc.query("select name, coalesce(intention, ''), gender, min_age, max_age from ad_roles where request_id = ? order by position", rs -> {
                    String age = rs.getObject(4) == null ? "" : (rs.getInt(4) + (rs.getObject(5) == null ? "+ ans" : "–" + rs.getInt(5) + " ans"));
                    String g = rs.getString(3) == null ? "" : rs.getString(3);
                    String detail = String.join(" · ", List.of(g, age).stream().filter(x -> !x.isBlank()).toList());
                    lines.add(new Line(rs.getString(1), (detail.isEmpty() ? "" : detail + " — ") + rs.getString(2)));
                }, r.getId());
                total = 1; filled = lines.isEmpty() ? 0 : 1;
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
            stages.add(new StageView(st.key(), st.num(), st.title(), st.owner(), st.intro(), mine, can, state, filled, total, fields, lines, lastBy, lastAt, sugg));
        }
        int req = 0, got = 0;
        for (StageView s : stages) { req += s.total(); got += Math.min(s.filled(), s.total()); }
        List<SourceView> sources = jdbc.query("""
            select s.id, s.kind, s.name, s.url, coalesce(u.first_name || ' ' || u.last_name, null), s.created_at, s.status, s.engine, s.filled, s.proposed, s.message
              from project_sheet_sources s left join users u on u.id = s.added_by where s.request_id = ? order by s.created_at desc limit 20""",
            (rs, i) -> new SourceView((UUID) rs.getObject(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
                    rs.getTimestamp(6).toLocalDateTime(), rs.getString(7), rs.getString(8), rs.getInt(9), rs.getInt(10), rs.getString(11)), r.getId());
        return new Sheet(r.getId(), r.getProject() == null ? null : r.getProject().getId(), r.getTitle(),
                r.getBrand() == null ? null : r.getBrand().getName(), r.getStatus().name(),
                req == 0 ? 0 : Math.round(got * 100f / req), done, stages.size(), hand, handOwner, !mySides.isEmpty(), stages, sources);
    }
}
