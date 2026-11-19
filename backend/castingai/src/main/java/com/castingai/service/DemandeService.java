package com.castingai.service;

import com.castingai.entity.*;
import com.castingai.exception.ForbiddenException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.*;
import com.castingai.storage.StorageService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Cahier v2, sprint 2 (T-158, T-159) · La marque crée sa demande de publicité, dépose sa V0 (fichier artistique et/ou
 * texte, sans budget) et l'envoie à une agence marketing. Chaque étape est inscrite au journal et notifiée.
 */
@Service
@RequiredArgsConstructor
public class DemandeService {

    public record DemandeRequest(
            @NotBlank(message = "Donnez un titre à votre publicité") @Size(max = 160, message = "Titre : 160 caractères au plus") String title,
            @Size(max = 160, message = "Produit : 160 caractères au plus") String product,
            @Size(max = 4000) String objective,
            @Size(max = 4000) String target,
            @Size(max = 4000) String keyMessage,
            LocalDate airDate) {}

    public record V0Text(@Size(max = 20000, message = "Le texte de la V0 ne dépasse pas 20 000 caractères") String body) {}
    public record Send(@NotNull(message = "Choisissez l'agence marketing") UUID agencyId) {}

    public record Summary(UUID id, String title, String product, AdRequest.Status status, String brandName, String agencyName,
                          LocalDate airDate, LocalDateTime updatedAt, boolean hasV0) {}
    public record VersionView(UUID id, AdVersion.Kind kind, String label, AdVersion.Status status, String body, String fileName,
                              String fileType, Long fileSize, String authorName, LocalDateTime createdAt, LocalDateTime deliveredAt) {}
    public record EventView(String type, String message, String actorName, LocalDateTime createdAt) {}
    public record Detail(UUID id, String title, String product, String objective, String target, String keyMessage, LocalDate airDate,
                         AdRequest.Status status, String brandName, UUID agencyId, String agencyName, String createdByName,
                         LocalDateTime createdAt, LocalDateTime updatedAt, boolean canEdit, boolean canRespond, boolean canAnalyse, Analysis analysis,
                         List<VersionView> versions, List<EventView> events) {}
    public record AgencyOption(UUID id, String name, String city) {}
    public record Refuse(@NotBlank(message = "Dites à la marque pourquoi vous refusez") @Size(max = 1000) String reason) {}
    public record Analysis(String summary, List<String> missing, List<String> questions, String source, LocalDateTime at) {}
    public record FileData(byte[] bytes, String name, String type) {}

    static final long MAX_FILE = 20L * 1024 * 1024;
    static final Set<String> EXT = Set.of("pdf", "doc", "docx", "ppt", "pptx", "odt", "odp", "key", "pages", "txt", "rtf", "jpg", "jpeg", "png");

    private final AdRequestRepository requests;
    private final AdVersionRepository versions;
    private final AdEventRepository events;
    private final AgencyRepository agencies;
    private final UserRepository users;
    private final AccessService access;
    private final NotificationService notifications;
    private final StorageService storage;
    private final V0Reader reader;
    private final V0Analyzer analyzer;

    // ── Lecture ──

    @Transactional(readOnly = true)
    public List<Summary> mine(String email) {
        User me = access.user(email);
        List<AdRequest> list = switch (me.getRole()) {
            case ADMIN -> requests.findAllByOrderByUpdatedAtDesc();
            case MARQUE -> requests.forBrand(me.getId(), me.getAgency() == null ? null : me.getAgency().getId());
            case AGENCE_MARKETING -> me.getAgency() == null ? List.of() : requests.forAgency(me.getAgency().getId());
            default -> List.of();
        };
        return list.stream().map(this::summary).toList();
    }

    @Transactional(readOnly = true)
    public Detail detail(String email, UUID id) {
        User me = access.user(email);
        return detail(me, visible(me, id));
    }

    @Transactional(readOnly = true)
    public List<AgencyOption> agencies() {
        return agencies.findAll().stream().filter(a -> "AGENCE_MARKETING".equals(a.getKind()))
                .sorted(Comparator.comparing(Agency::getName, String.CASE_INSENSITIVE_ORDER))
                .map(a -> new AgencyOption(a.getId(), a.getName(), a.getCity())).toList();
    }

    @Transactional(readOnly = true)
    public FileData file(String email, UUID id, UUID versionId) {
        User me = access.user(email);
        AdRequest r = visible(me, id);
        AdVersion v = versions.findById(versionId).filter(x -> x.getRequest().getId().equals(r.getId()) && x.getFileKey() != null)
                .orElseThrow(() -> new ResourceNotFoundException("Fichier introuvable"));
        try { return new FileData(storage.download(v.getFileKey()), v.getFileName(), v.getFileType()); }
        catch (Exception e) { throw new IllegalStateException("Fichier indisponible pour le moment", e); }
    }

    // ── Marque : brouillon ──

    @Transactional
    public Detail create(String email, DemandeRequest req) {
        User me = access.user(email);
        if (me.getRole() != Role.MARQUE && me.getRole() != Role.ADMIN) throw new ForbiddenException("Seule une marque crée une demande de publicité");
        AdRequest r = new AdRequest();
        r.setCreatedBy(me);
        r.setBrand(me.getAgency());
        apply(r, req);
        requests.save(r);
        log(r, me, "CREEE", "Demande créée par " + name(me));
        return detail(me, r);
    }

    @Transactional
    public Detail update(String email, UUID id, DemandeRequest req) {
        User me = access.user(email);
        AdRequest r = editable(me, id);
        apply(r, req);
        return detail(me, r);
    }

    @Transactional
    public Detail saveV0Text(String email, UUID id, V0Text req) {
        User me = access.user(email);
        AdRequest r = editable(me, id);
        AdVersion v = draftV0(r, me);
        v.setBody(req.body() == null || req.body().isBlank() ? null : req.body().trim());
        versions.save(v);
        return detail(me, r);
    }

    @Transactional
    public Detail uploadV0File(String email, UUID id, MultipartFile file) {
        User me = access.user(email);
        AdRequest r = editable(me, id);
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("Choisissez un fichier");
        if (file.getSize() > MAX_FILE) throw new IllegalArgumentException("Le fichier dépasse 20 Mo");
        String original = Optional.ofNullable(file.getOriginalFilename()).orElse("v0");
        String ext = original.contains(".") ? original.substring(original.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        if (!EXT.contains(ext)) throw new IllegalArgumentException("Format accepté : PDF, Word, PowerPoint, Keynote, texte ou image");
        AdVersion v = draftV0(r, me);
        String old = v.getFileKey();
        String safe = original.replaceAll("[^A-Za-z0-9._-]", "_");
        if (safe.length() > 80) safe = safe.substring(safe.length() - 80);
        String key = "demandes/" + r.getId() + "/v0-" + UUID.randomUUID() + "-" + safe;
        try { storage.upload(file, key); } catch (Exception e) { throw new IllegalStateException("Envoi du fichier impossible pour le moment", e); }
        if (old != null) { try { storage.delete(old); } catch (Exception ignored) { } }
        v.setFileKey(key); v.setFileName(original); v.setFileType(file.getContentType()); v.setFileSize(file.getSize());
        versions.save(v);
        log(r, me, "V0_FICHIER", "Fichier de la V0 déposé : " + original);
        return detail(me, r);
    }

    @Transactional
    public Detail removeV0File(String email, UUID id) {
        User me = access.user(email);
        AdRequest r = editable(me, id);
        versions.findFirstByRequestIdAndKindOrderByCreatedAtDesc(r.getId(), AdVersion.Kind.V0).ifPresent(v -> {
            if (v.getFileKey() != null) { try { storage.delete(v.getFileKey()); } catch (Exception ignored) { } }
            v.setFileKey(null); v.setFileName(null); v.setFileType(null); v.setFileSize(null);
            versions.save(v);
        });
        return detail(me, r);
    }

    // ── Étapes ──

    /** Envoie la V0 à l'agence choisie : la V0 est figée, l'agence est notifiée. */
    @Transactional
    public Detail send(String email, UUID id, Send req) {
        User me = access.user(email);
        AdRequest r = editable(me, id);
        AdVersion v0 = versions.findFirstByRequestIdAndKindOrderByCreatedAtDesc(r.getId(), AdVersion.Kind.V0).orElse(null);
        if (v0 == null || (v0.getBody() == null && v0.getFileKey() == null)) {
            throw new IllegalArgumentException("Déposez votre V0 (un fichier ou un texte) avant de l'envoyer");
        }
        Agency agency = agencies.findById(req.agencyId()).filter(a -> "AGENCE_MARKETING".equals(a.getKind()))
                .orElseThrow(() -> new IllegalArgumentException("Choisissez une agence marketing inscrite"));
        r.setAgency(agency);
        r.setStatus(AdRequest.Status.V0_ENVOYEE);
        v0.setStatus(AdVersion.Status.LIVREE);
        v0.setDeliveredAt(LocalDateTime.now());
        versions.save(v0);
        log(r, me, "V0_ENVOYEE", "V0 envoyée à " + agency.getName());
        String brand = r.getBrand() != null ? r.getBrand().getName() : name(me);
        users.findAll().stream().filter(u -> u.getAgency() != null && u.getAgency().getId().equals(agency.getId()) && u.isEnabled())
                .forEach(u -> notifications.push(u.getId(), "DEMANDE", "Nouvelle demande : " + r.getTitle(),
                        brand + " vous envoie sa V0. Analysez-la et préparez votre V1.", "/demandes/" + r.getId()));
        return detail(me, r);
    }

    @Transactional
    public Detail cancel(String email, UUID id) {
        User me = access.user(email);
        AdRequest r = visible(me, id);
        if (!isBrandSide(me, r)) throw new ForbiddenException("Seule la marque peut annuler sa demande");
        if (r.getStatus() != AdRequest.Status.BROUILLON && r.getStatus() != AdRequest.Status.V0_ENVOYEE) {
            throw new IllegalArgumentException("La demande est déjà en cours chez l'agence : elle ne s'annule plus ici");
        }
        r.setStatus(AdRequest.Status.ANNULEE);
        log(r, me, "ANNULEE", "Demande annulée par " + name(me));
        if (r.getAgency() != null) {
            users.findAll().stream().filter(u -> u.getAgency() != null && u.getAgency().getId().equals(r.getAgency().getId()))
                    .forEach(u -> notifications.push(u.getId(), "DEMANDE", "Demande annulée : " + r.getTitle(), "La marque a annulé sa demande.", "/demandes/" + r.getId()));
        }
        return detail(me, r);
    }

    @Transactional
    public void delete(String email, UUID id) {
        User me = access.user(email);
        AdRequest r = editable(me, id);
        versions.findByRequestIdOrderByCreatedAtAsc(r.getId()).forEach(v -> {
            if (v.getFileKey() != null) { try { storage.delete(v.getFileKey()); } catch (Exception ignored) { } }
        });
        requests.delete(r);
    }

    // ── Agence : réponse et analyse (T-160) ──

    /** L'agence accepte la demande : elle passe en « V1 en cours », la marque est notifiée. */
    @Transactional
    public Detail accept(String email, UUID id) {
        User me = access.user(email);
        AdRequest r = respondable(me, id);
        r.setStatus(AdRequest.Status.V1_EN_COURS);
        log(r, me, "ACCEPTEE", "Demande acceptée par " + r.getAgency().getName() + " : la V1 est en préparation");
        notifyBrand(r, "Demande acceptée : " + r.getTitle(), r.getAgency().getName() + " a accepté votre demande et prépare sa V1.");
        return detail(me, r);
    }

    /** L'agence refuse avec un motif : la demande revient en brouillon chez la marque, qui peut la modifier et l'envoyer ailleurs. */
    @Transactional
    public Detail refuse(String email, UUID id, Refuse req) {
        User me = access.user(email);
        AdRequest r = respondable(me, id);
        String agency = r.getAgency().getName(), reason = req.reason().trim();
        versions.findFirstByRequestIdAndKindOrderByCreatedAtDesc(r.getId(), AdVersion.Kind.V0).ifPresent(v -> {
            v.setStatus(AdVersion.Status.BROUILLON); v.setDeliveredAt(null); versions.save(v);
        });
        notifyBrand(r, "Demande refusée : " + r.getTitle(), agency + " a refusé votre demande : " + reason);
        r.setAgency(null);
        r.setStatus(AdRequest.Status.BROUILLON);
        r.setAiSummary(null); r.setAiMissing(null); r.setAiQuestions(null); r.setAiSource(null); r.setAiAt(null);
        log(r, me, "REFUSEE", "Demande refusée par " + agency + " : " + reason);
        Detail d = detail(me, r);
        return d;
    }

    /** Analyse de la V0 (résumé, points manquants, questions) pour l'agence. Relançable. */
    @Transactional
    public Detail analyse(String email, UUID id) {
        User me = access.user(email);
        AdRequest r = visible(me, id);
        if (!isAgencySide(me, r) || !analysable(r)) throw new ForbiddenException("L'analyse de la V0 est réservée à l'agence qui a reçu la demande");
        AdVersion v0 = versions.findFirstByRequestIdAndKindOrderByCreatedAtDesc(r.getId(), AdVersion.Kind.V0)
                .orElseThrow(() -> new IllegalArgumentException("Cette demande n'a pas de V0"));
        String fileText = null;
        if (v0.getFileKey() != null) {
            try { fileText = reader.read(storage.download(v0.getFileKey()), v0.getFileName()); } catch (Exception ignored) { }
        }
        V0Analyzer.Result res = analyzer.analyse(r, v0.getBody(), fileText, v0.getFileName());
        r.setAiSummary(res.summary());
        r.setAiMissing(String.join("\n", res.missing()));
        r.setAiQuestions(String.join("\n", res.questions()));
        r.setAiSource(res.source());
        r.setAiAt(LocalDateTime.now());
        log(r, me, "ANALYSE", res.source().equals("IA") ? "V0 analysée par l'IA locale" : "V0 analysée (règles seules : l'IA locale n'a pas répondu)");
        return detail(me, r);
    }

    private AdRequest respondable(User me, UUID id) {
        AdRequest r = visible(me, id);
        if (!isAgencySide(me, r)) throw new ForbiddenException("Seule l'agence qui a reçu la demande peut y répondre");
        if (r.getStatus() != AdRequest.Status.V0_ENVOYEE) throw new IllegalArgumentException("Cette demande a déjà reçu une réponse");
        return r;
    }

    private void notifyBrand(AdRequest r, String title, String body) {
        Set<UUID> to = new LinkedHashSet<>();
        to.add(r.getCreatedBy().getId());
        if (r.getBrand() != null) users.findAll().stream()
                .filter(u -> u.getAgency() != null && u.getAgency().getId().equals(r.getBrand().getId()) && u.isEnabled())
                .forEach(u -> to.add(u.getId()));
        to.forEach(u -> notifications.push(u, "DEMANDE", title, body, "/demandes/" + r.getId()));
    }

    private boolean isAgencySide(User me, AdRequest r) {
        if (r.getAgency() == null) return false;
        if (me.getRole() == Role.ADMIN) return true;
        return me.getRole() == Role.AGENCE_MARKETING && me.getAgency() != null && me.getAgency().getId().equals(r.getAgency().getId());
    }

    private static boolean analysable(AdRequest r) {
        return r.getStatus() == AdRequest.Status.V0_ENVOYEE || r.getStatus() == AdRequest.Status.V1_EN_COURS;
    }

    // ── Règles ──

    private boolean isBrandSide(User me, AdRequest r) {
        if (me.getRole() == Role.ADMIN) return true;
        if (me.getRole() != Role.MARQUE) return false;
        return r.getCreatedBy().getId().equals(me.getId())
                || (me.getAgency() != null && r.getBrand() != null && r.getBrand().getId().equals(me.getAgency().getId()));
    }

    private boolean canSee(User me, AdRequest r) {
        if (isBrandSide(me, r)) return true;
        return me.getAgency() != null && r.getAgency() != null && r.getAgency().getId().equals(me.getAgency().getId())
                && r.getStatus() != AdRequest.Status.BROUILLON;
    }

    private AdRequest visible(User me, UUID id) {
        AdRequest r = requests.findById(id).orElseThrow(() -> new ResourceNotFoundException("Demande introuvable"));
        if (!canSee(me, r)) throw new ResourceNotFoundException("Demande introuvable");
        return r;
    }

    private AdRequest editable(User me, UUID id) {
        AdRequest r = visible(me, id);
        if (!isBrandSide(me, r)) throw new ForbiddenException("Seule la marque modifie sa demande");
        if (r.getStatus() != AdRequest.Status.BROUILLON) throw new IllegalArgumentException("La V0 est envoyée : la demande ne se modifie plus");
        return r;
    }

    private AdVersion draftV0(AdRequest r, User me) {
        return versions.findFirstByRequestIdAndKindOrderByCreatedAtDesc(r.getId(), AdVersion.Kind.V0).orElseGet(() -> {
            AdVersion v = new AdVersion();
            v.setRequest(r); v.setKind(AdVersion.Kind.V0); v.setLabel("V0"); v.setAuthor(me);
            return versions.save(v);
        });
    }

    private static void apply(AdRequest r, DemandeRequest q) {
        r.setTitle(q.title().trim());
        r.setProduct(blank(q.product()));
        r.setObjective(blank(q.objective()));
        r.setTarget(blank(q.target()));
        r.setKeyMessage(blank(q.keyMessage()));
        if (q.airDate() != null && q.airDate().isBefore(LocalDate.now())) throw new IllegalArgumentException("La date de diffusion est déjà passée");
        r.setAirDate(q.airDate());
    }

    private void log(AdRequest r, User me, String type, String message) {
        AdEvent e = new AdEvent();
        e.setRequest(r); e.setActor(me); e.setType(type); e.setMessage(message.length() > 400 ? message.substring(0, 400) : message);
        events.save(e);
    }

    private Summary summary(AdRequest r) {
        boolean hasV0 = versions.findFirstByRequestIdAndKindOrderByCreatedAtDesc(r.getId(), AdVersion.Kind.V0)
                .map(v -> v.getBody() != null || v.getFileKey() != null).orElse(false);
        return new Summary(r.getId(), r.getTitle(), r.getProduct(), r.getStatus(), r.getBrand() == null ? name(r.getCreatedBy()) : r.getBrand().getName(),
                r.getAgency() == null ? null : r.getAgency().getName(), r.getAirDate(), r.getUpdatedAt(), hasV0);
    }

    private Detail detail(User me, AdRequest r) {
        List<VersionView> vs = versions.findByRequestIdOrderByCreatedAtAsc(r.getId()).stream()
                // l'agence ne voit une version qu'une fois livrée
                .filter(v -> isBrandSide(me, r) || v.getStatus() != AdVersion.Status.BROUILLON || (v.getAuthor() != null && v.getAuthor().getId().equals(me.getId())))
                .map(v -> new VersionView(v.getId(), v.getKind(), v.getLabel(), v.getStatus(), v.getBody(), v.getFileName(), v.getFileType(),
                        v.getFileSize(), v.getAuthor() == null ? null : name(v.getAuthor()), v.getCreatedAt(), v.getDeliveredAt())).toList();
        List<EventView> ev = events.findByRequestIdOrderByCreatedAtDesc(r.getId()).stream()
                .map(e -> new EventView(e.getType(), e.getMessage(), e.getActor() == null ? null : name(e.getActor()), e.getCreatedAt())).toList();
        return new Detail(r.getId(), r.getTitle(), r.getProduct(), r.getObjective(), r.getTarget(), r.getKeyMessage(), r.getAirDate(), r.getStatus(),
                r.getBrand() == null ? name(r.getCreatedBy()) : r.getBrand().getName(), r.getAgency() == null ? null : r.getAgency().getId(),
                r.getAgency() == null ? null : r.getAgency().getName(), name(r.getCreatedBy()), r.getCreatedAt(), r.getUpdatedAt(),
                isBrandSide(me, r) && r.getStatus() == AdRequest.Status.BROUILLON,
                isAgencySide(me, r) && r.getStatus() == AdRequest.Status.V0_ENVOYEE,
                isAgencySide(me, r) && analysable(r), analysis(r), vs, ev);
    }

    private static Analysis analysis(AdRequest r) {
        if (r.getAiAt() == null) return null;
        return new Analysis(r.getAiSummary(), lines(r.getAiMissing()), lines(r.getAiQuestions()), r.getAiSource(), r.getAiAt());
    }
    private static List<String> lines(String s) { return s == null || s.isBlank() ? List.of() : List.of(s.split("\n")); }

    private static String name(User u) { return (u.getFirstName() + " " + u.getLastName()).trim(); }
    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
