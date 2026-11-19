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
                              String fileType, Long fileSize, String authorName, LocalDateTime createdAt, LocalDateTime deliveredAt,
                              String reviewComment, LocalDateTime reviewedAt) {}
    public record EventView(String type, String message, String actorName, LocalDateTime createdAt) {}
    public record Detail(UUID id, String title, String product, String objective, String target, String keyMessage, LocalDate airDate,
                         AdRequest.Status status, String brandName, UUID agencyId, String agencyName, String createdByName,
                         LocalDateTime createdAt, LocalDateTime updatedAt, boolean canEdit, boolean canRespond, boolean canAnalyse, Analysis analysis,
                         boolean canEditV1, boolean canReviewV1, boolean canChooseProduction, boolean v1Validated, String productionName,
                         boolean canEditExpectations, List<CharacterView> characters, String directorName, String firstAdName, LocalDateTime expectationsSentAt,
                         List<VersionView> versions, List<EventView> events) {}
    public record AgencyOption(UUID id, String name, String city) {}
    public record CharacterRequest(@NotBlank(message = "Donnez un nom au personnage") @Size(max = 120) String name,
                                   @Size(max = 4000) String story, @Size(max = 4000) String brandWish,
                                   @Size(max = 4000) String agencyWish, @Size(max = 4000) String notes) {}
    public record CharacterView(UUID id, String name, String story, String brandWish, String agencyWish, String notes) {}
    public record Transmit(@NotNull(message = "Choisissez le réalisateur") UUID directorId, UUID firstAdId) {}
    public record PersonOption(UUID id, String name, String organisation) {}
    public record Comment(@NotBlank(message = "Expliquez ce qu'il faut revoir") @Size(max = 2000) String comment) {}
    public record ChooseProduction(@NotNull(message = "Choisissez la boîte de production") UUID productionId) {}
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
    private final AdCharacterRepository characters;
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
            case BOITE_PROD -> me.getAgency() == null ? List.of() : requests.forProduction(me.getAgency().getId());
            case REALISATEUR -> requests.forDirector(me.getId());
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

    // ── Agence : V1, révisions, production (T-161) ──

    @Transactional
    public Detail saveV1Text(String email, UUID id, V0Text req) {
        User me = access.user(email);
        AdRequest r = v1Editable(me, id);
        AdVersion v = draftV1(r, me);
        v.setBody(req.body() == null || req.body().isBlank() ? null : req.body().trim());
        versions.save(v);
        return detail(me, r);
    }

    @Transactional
    public Detail uploadV1File(String email, UUID id, MultipartFile file) {
        User me = access.user(email);
        AdRequest r = v1Editable(me, id);
        AdVersion v = draftV1(r, me);
        String name = storeFile(r, v, file, "v1");
        log(r, me, "V1_FICHIER", "Fichier de la " + v.getLabel() + " déposé : " + name);
        return detail(me, r);
    }

    @Transactional
    public Detail removeV1File(String email, UUID id) {
        User me = access.user(email);
        AdRequest r = v1Editable(me, id);
        AdVersion v = draftV1(r, me);
        if (v.getFileKey() != null) { try { storage.delete(v.getFileKey()); } catch (Exception ignored) { } }
        v.setFileKey(null); v.setFileName(null); v.setFileType(null); v.setFileSize(null);
        versions.save(v);
        return detail(me, r);
    }

    /** L'agence livre sa V1 (ou V1.1, V1.2… après révision) : la version est figée, la marque est notifiée. */
    @Transactional
    public Detail deliverV1(String email, UUID id) {
        User me = access.user(email);
        AdRequest r = v1Editable(me, id);
        AdVersion v = versions.findFirstByRequestIdAndKindOrderByCreatedAtDesc(r.getId(), AdVersion.Kind.V1)
                .filter(x -> x.getStatus() == AdVersion.Status.BROUILLON).orElse(null);
        if (v == null || (v.getBody() == null && v.getFileKey() == null)) throw new IllegalArgumentException("Écrivez votre V1 ou déposez un fichier avant de la livrer");
        v.setStatus(AdVersion.Status.LIVREE); v.setDeliveredAt(LocalDateTime.now()); versions.save(v);
        r.setStatus(AdRequest.Status.V1_LIVREE);
        log(r, me, "V1_LIVREE", v.getLabel() + " livrée par " + r.getAgency().getName());
        notifyBrand(r, v.getLabel() + " livrée : " + r.getTitle(), r.getAgency().getName() + " vous livre sa " + v.getLabel() + ". Validez-la ou demandez une révision.");
        return detail(me, r);
    }

    /** La marque renvoie la V1 en révision avec un commentaire : l'agence prépare la version suivante. */
    @Transactional
    public Detail reviseV1(String email, UUID id, Comment req) {
        User me = access.user(email);
        AdRequest r = v1Reviewable(me, id);
        AdVersion v = lastDeliveredV1(r);
        v.setStatus(AdVersion.Status.A_REVISER); v.setReviewComment(req.comment().trim()); v.setReviewedAt(LocalDateTime.now()); versions.save(v);
        r.setStatus(AdRequest.Status.V1_EN_COURS);
        log(r, me, "V1_REVISION", v.getLabel() + " à revoir : " + req.comment().trim());
        notifyOrg(r.getAgency(), "Révision demandée : " + r.getTitle(), "La marque demande de revoir la " + v.getLabel() + " : " + req.comment().trim(), r);
        return detail(me, r);
    }

    /** La marque valide la V1 : l'agence peut choisir la boîte de production. */
    @Transactional
    public Detail validateV1(String email, UUID id) {
        User me = access.user(email);
        AdRequest r = v1Reviewable(me, id);
        AdVersion v = lastDeliveredV1(r);
        r.setV1ValidatedAt(LocalDateTime.now());
        log(r, me, "V1_VALIDEE", v.getLabel() + " validée par la marque");
        notifyOrg(r.getAgency(), v.getLabel() + " validée : " + r.getTitle(), "La marque a validé votre " + v.getLabel() + ". Choisissez la boîte de production.", r);
        return detail(me, r);
    }

    @Transactional(readOnly = true)
    public List<AgencyOption> productions() {
        return agencies.findAll().stream().filter(a -> "BOITE_PROD".equals(a.getKind()))
                .sorted(Comparator.comparing(Agency::getName, String.CASE_INSENSITIVE_ORDER))
                .map(a -> new AgencyOption(a.getId(), a.getName(), a.getCity())).toList();
    }

    /** L'agence confie la demande à une boîte de production : la V2 commence, la production est notifiée. */
    @Transactional
    public Detail chooseProduction(String email, UUID id, ChooseProduction req) {
        User me = access.user(email);
        AdRequest r = visible(me, id);
        if (!isAgencySide(me, r)) throw new ForbiddenException("Seule l'agence choisit la boîte de production");
        if (r.getStatus() != AdRequest.Status.V1_LIVREE || r.getV1ValidatedAt() == null) throw new IllegalArgumentException("La marque doit d'abord valider la V1");
        Agency prod = agencies.findById(req.productionId()).filter(a -> "BOITE_PROD".equals(a.getKind()))
                .orElseThrow(() -> new IllegalArgumentException("Choisissez une boîte de production inscrite"));
        r.setProduction(prod);
        r.setStatus(AdRequest.Status.V2_EN_COURS);
        log(r, me, "PRODUCTION", "Demande confiée à " + prod.getName() + " : recueil des attentes et V2 du réalisateur");
        notifyOrg(prod, "Nouvelle publicité : " + r.getTitle(), r.getAgency().getName() + " vous confie la production. Recueillez les attentes sur les profils.", r);
        notifyBrand(r, "Production choisie : " + r.getTitle(), r.getAgency().getName() + " a confié la production à " + prod.getName() + ".");
        return detail(me, r);
    }

    // ── Production : attentes par personnage, transmission au réalisateur (T-162) ──

    @Transactional
    public Detail addCharacter(String email, UUID id, CharacterRequest req) {
        User me = access.user(email);
        AdRequest r = expectationsEditable(me, id);
        AdCharacter c = new AdCharacter();
        c.setRequest(r);
        c.setPosition((int) characters.countByRequestId(r.getId()));
        fill(c, req);
        characters.save(c);
        log(r, me, "PERSONNAGE", "Personnage ajouté : " + c.getName());
        return detail(me, r);
    }

    @Transactional
    public Detail updateCharacter(String email, UUID id, UUID characterId, CharacterRequest req) {
        User me = access.user(email);
        AdRequest r = expectationsEditable(me, id);
        AdCharacter c = character(r, characterId);
        fill(c, req);
        characters.save(c);
        return detail(me, r);
    }

    @Transactional
    public Detail deleteCharacter(String email, UUID id, UUID characterId) {
        User me = access.user(email);
        AdRequest r = expectationsEditable(me, id);
        AdCharacter c = character(r, characterId);
        characters.delete(c);
        log(r, me, "PERSONNAGE", "Personnage retiré : " + c.getName());
        return detail(me, r);
    }

    /** Réalisateurs et 1er AD inscrits (validés), pour la transmission des attentes. */
    @Transactional(readOnly = true)
    public List<PersonOption> directors(String email) {
        User me = access.user(email);
        if (me.getRole() != Role.BOITE_PROD && me.getRole() != Role.ADMIN) throw new ForbiddenException("Réservé à la boîte de production");
        return users.findAll().stream().filter(u -> u.getRole() == Role.REALISATEUR && u.isEnabled())
                .sorted(Comparator.comparing(u -> name(u), String.CASE_INSENSITIVE_ORDER))
                .map(u -> new PersonOption(u.getId(), name(u), u.getAgency() == null ? null : u.getAgency().getName())).toList();
    }

    /** La production transmet les attentes au réalisateur (et au 1er AD) : ils voient la demande et sont notifiés. Relançable. */
    @Transactional
    public Detail transmit(String email, UUID id, Transmit req) {
        User me = access.user(email);
        AdRequest r = expectationsEditable(me, id);
        if (characters.countByRequestId(r.getId()) == 0) throw new IllegalArgumentException("Ajoutez au moins un personnage avant de transmettre");
        User director = users.findById(req.directorId()).filter(u -> u.getRole() == Role.REALISATEUR && u.isEnabled())
                .orElseThrow(() -> new IllegalArgumentException("Choisissez un réalisateur inscrit"));
        User firstAd = req.firstAdId() == null ? null : users.findById(req.firstAdId()).filter(u -> u.getRole() == Role.REALISATEUR && u.isEnabled())
                .orElseThrow(() -> new IllegalArgumentException("Choisissez un 1er AD inscrit"));
        if (firstAd != null && firstAd.getId().equals(director.getId())) throw new IllegalArgumentException("Le 1er AD doit être une autre personne que le réalisateur");
        boolean again = r.getExpectationsSentAt() != null;
        r.setDirector(director); r.setFirstAd(firstAd); r.setExpectationsSentAt(LocalDateTime.now());
        log(r, me, "ATTENTES", (again ? "Attentes mises à jour et transmises à " : "Attentes transmises à ") + name(director) + (firstAd == null ? "" : " et " + name(firstAd)));
        String body = r.getProduction().getName() + (again ? " a mis à jour" : " vous transmet") + " les attentes de la marque et de l'agence, personnage par personnage. À vous la V2.";
        for (User u : firstAd == null ? List.of(director) : List.of(director, firstAd)) {
            notifications.push(u.getId(), "DEMANDE", (again ? "Attentes mises à jour : " : "Nouvelle publicité : ") + r.getTitle(), body, "/demandes/" + r.getId());
        }
        return detail(me, r);
    }

    private AdRequest expectationsEditable(User me, UUID id) {
        AdRequest r = visible(me, id);
        if (!isProductionSide(me, r)) throw new ForbiddenException("Seule la boîte de production saisit les attentes");
        if (r.getStatus() != AdRequest.Status.V2_EN_COURS) throw new IllegalArgumentException("Les attentes se saisissent pendant la préparation de la V2");
        return r;
    }

    private AdCharacter character(AdRequest r, UUID characterId) {
        return characters.findById(characterId).filter(c -> c.getRequest().getId().equals(r.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Personnage introuvable"));
    }

    private static void fill(AdCharacter c, CharacterRequest q) {
        c.setName(q.name().trim()); c.setStory(blank(q.story())); c.setBrandWish(blank(q.brandWish()));
        c.setAgencyWish(blank(q.agencyWish())); c.setNotes(blank(q.notes()));
    }

    private AdRequest v1Editable(User me, UUID id) {
        AdRequest r = visible(me, id);
        if (!isAgencySide(me, r)) throw new ForbiddenException("Seule l'agence écrit la V1");
        if (r.getStatus() != AdRequest.Status.V1_EN_COURS) throw new IllegalArgumentException("La V1 n'est pas en préparation");
        return r;
    }

    private AdRequest v1Reviewable(User me, UUID id) {
        AdRequest r = visible(me, id);
        if (!isBrandSide(me, r)) throw new ForbiddenException("Seule la marque valide ou fait réviser la V1");
        if (r.getStatus() != AdRequest.Status.V1_LIVREE || r.getV1ValidatedAt() != null) throw new IllegalArgumentException("Aucune V1 en attente de votre avis");
        return r;
    }

    private AdVersion lastDeliveredV1(AdRequest r) {
        return versions.findFirstByRequestIdAndKindOrderByCreatedAtDesc(r.getId(), AdVersion.Kind.V1)
                .filter(x -> x.getStatus() == AdVersion.Status.LIVREE)
                .orElseThrow(() -> new IllegalArgumentException("Aucune V1 livrée"));
    }

    /** Brouillon de V1 en cours, ou nouveau brouillon : « V1 », puis « V1.1 », « V1.2 »… après chaque révision. */
    private AdVersion draftV1(AdRequest r, User me) {
        Optional<AdVersion> last = versions.findFirstByRequestIdAndKindOrderByCreatedAtDesc(r.getId(), AdVersion.Kind.V1);
        if (last.isPresent() && last.get().getStatus() == AdVersion.Status.BROUILLON) return last.get();
        long done = versions.findByRequestIdOrderByCreatedAtAsc(r.getId()).stream().filter(x -> x.getKind() == AdVersion.Kind.V1).count();
        AdVersion v = new AdVersion();
        v.setRequest(r); v.setKind(AdVersion.Kind.V1); v.setLabel(done == 0 ? "V1" : "V1." + done); v.setAuthor(me);
        // la révision part de la version précédente : on reprend son texte
        last.ifPresent(p -> v.setBody(p.getBody()));
        return versions.save(v);
    }

    /** Range un fichier de version dans le stockage et le rattache à la version (l'ancien fichier est retiré). */
    private String storeFile(AdRequest r, AdVersion v, MultipartFile file, String prefix) {
        if (file == null || file.isEmpty()) throw new IllegalArgumentException("Choisissez un fichier");
        if (file.getSize() > MAX_FILE) throw new IllegalArgumentException("Le fichier dépasse 20 Mo");
        String original = Optional.ofNullable(file.getOriginalFilename()).orElse(prefix);
        String ext = original.contains(".") ? original.substring(original.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        if (!EXT.contains(ext)) throw new IllegalArgumentException("Format accepté : PDF, Word, PowerPoint, Keynote, texte ou image");
        String old = v.getFileKey();
        String safe = original.replaceAll("[^A-Za-z0-9._-]", "_");
        if (safe.length() > 80) safe = safe.substring(safe.length() - 80);
        String key = "demandes/" + r.getId() + "/" + prefix + "-" + UUID.randomUUID() + "-" + safe;
        try { storage.upload(file, key); } catch (Exception e) { throw new IllegalStateException("Envoi du fichier impossible pour le moment", e); }
        if (old != null) { try { storage.delete(old); } catch (Exception ignored) { } }
        v.setFileKey(key); v.setFileName(original); v.setFileType(file.getContentType()); v.setFileSize(file.getSize());
        versions.save(v);
        return original;
    }

    private void notifyOrg(Agency org, String title, String body, AdRequest r) {
        if (org == null) return;
        users.findAll().stream().filter(u -> u.getAgency() != null && u.getAgency().getId().equals(org.getId()) && u.isEnabled())
                .forEach(u -> notifications.push(u.getId(), "DEMANDE", title, body, "/demandes/" + r.getId()));
    }

    private boolean isDirectorSide(User me, AdRequest r) {
        return me.getRole() == Role.REALISATEUR && ((r.getDirector() != null && r.getDirector().getId().equals(me.getId()))
                || (r.getFirstAd() != null && r.getFirstAd().getId().equals(me.getId())));
    }

    private boolean isProductionSide(User me, AdRequest r) {
        if (r.getProduction() != null && me.getRole() == Role.ADMIN) return true;
        return r.getProduction() != null && me.getRole() == Role.BOITE_PROD && me.getAgency() != null
                && me.getAgency().getId().equals(r.getProduction().getId());
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
        if (isProductionSide(me, r)) return true;
        if (isDirectorSide(me, r)) return true;
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
                .filter(v -> v.getStatus() != AdVersion.Status.BROUILLON
                        || (v.getKind() == AdVersion.Kind.V0 ? isBrandSide(me, r) : isAgencySide(me, r)))
                .map(v -> new VersionView(v.getId(), v.getKind(), v.getLabel(), v.getStatus(), v.getBody(), v.getFileName(), v.getFileType(),
                        v.getFileSize(), v.getAuthor() == null ? null : name(v.getAuthor()), v.getCreatedAt(), v.getDeliveredAt(),
                        v.getReviewComment(), v.getReviewedAt())).toList();
        List<EventView> ev = events.findByRequestIdOrderByCreatedAtDesc(r.getId()).stream()
                .map(e -> new EventView(e.getType(), e.getMessage(), e.getActor() == null ? null : name(e.getActor()), e.getCreatedAt())).toList();
        return new Detail(r.getId(), r.getTitle(), r.getProduct(), r.getObjective(), r.getTarget(), r.getKeyMessage(), r.getAirDate(), r.getStatus(),
                r.getBrand() == null ? name(r.getCreatedBy()) : r.getBrand().getName(), r.getAgency() == null ? null : r.getAgency().getId(),
                r.getAgency() == null ? null : r.getAgency().getName(), name(r.getCreatedBy()), r.getCreatedAt(), r.getUpdatedAt(),
                isBrandSide(me, r) && r.getStatus() == AdRequest.Status.BROUILLON,
                isAgencySide(me, r) && r.getStatus() == AdRequest.Status.V0_ENVOYEE,
                isAgencySide(me, r) && analysable(r), analysis(r),
                isAgencySide(me, r) && r.getStatus() == AdRequest.Status.V1_EN_COURS,
                isBrandSide(me, r) && r.getStatus() == AdRequest.Status.V1_LIVREE && r.getV1ValidatedAt() == null,
                isAgencySide(me, r) && r.getStatus() == AdRequest.Status.V1_LIVREE && r.getV1ValidatedAt() != null,
                r.getV1ValidatedAt() != null, r.getProduction() == null ? null : r.getProduction().getName(),
                isProductionSide(me, r) && r.getStatus() == AdRequest.Status.V2_EN_COURS,
                characters.findByRequestIdOrderByPositionAscCreatedAtAsc(r.getId()).stream()
                        .map(c -> new CharacterView(c.getId(), c.getName(), c.getStory(), c.getBrandWish(), c.getAgencyWish(), c.getNotes())).toList(),
                r.getDirector() == null ? null : name(r.getDirector()), r.getFirstAd() == null ? null : name(r.getFirstAd()),
                r.getExpectationsSentAt(), vs, ev);
    }

    private static Analysis analysis(AdRequest r) {
        if (r.getAiAt() == null) return null;
        return new Analysis(r.getAiSummary(), lines(r.getAiMissing()), lines(r.getAiQuestions()), r.getAiSource(), r.getAiAt());
    }
    private static List<String> lines(String s) { return s == null || s.isBlank() ? List.of() : List.of(s.split("\n")); }

    private static String name(User u) { return (u.getFirstName() + " " + u.getLastName()).trim(); }
    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
