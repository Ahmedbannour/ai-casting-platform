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

    /** Texte d'une version et, au besoin, le lien de sa présentation Canva (ou autre présentation en ligne). */
    public record V0Text(@Size(max = 20000, message = "Le texte ne dépasse pas 20 000 caractères") String body,
                         @Size(max = 500, message = "Le lien ne dépasse pas 500 caractères") String link) {}
    public record Send(@NotNull(message = "Choisissez l'agence marketing") UUID agencyId) {}

    public record Summary(UUID id, String title, String product, AdRequest.Status status, String brandName, String agencyName,
                          LocalDate airDate, LocalDateTime updatedAt, boolean hasV0, String nowWho, String nowWhat) {}
    public record VersionView(UUID id, AdVersion.Kind kind, String label, AdVersion.Status status, String body, String fileName,
                              String fileType, Long fileSize, String authorName, LocalDateTime createdAt, LocalDateTime deliveredAt,
                              String reviewComment, LocalDateTime reviewedAt, String linkUrl) {}
    public record EventView(String type, String message, String actorName, LocalDateTime createdAt) {}
    public record Detail(UUID id, String title, String product, String objective, String target, String keyMessage, LocalDate airDate,
                         AdRequest.Status status, String brandName, UUID agencyId, String agencyName, String createdByName,
                         LocalDateTime createdAt, LocalDateTime updatedAt, boolean canEdit, boolean canRespond, boolean canAnalyse, Analysis analysis,
                         boolean canEditV1, boolean canReviewV1, boolean canChooseProduction, boolean v1Validated, String productionName,
                         boolean canEditExpectations, List<CharacterView> characters, String directorName, String firstAdName, LocalDateTime expectationsSentAt,
                         boolean canEditV2, List<SceneView> scenes, List<RoleSheetView> roles, UUID projectId, LocalDateTime v2PublishedAt,
                         boolean canAttachTeam, UUID directorId, UUID firstAdId, String nowWho, String nowWhat,
                         List<VersionView> versions, List<EventView> events) {}
    public record AgencyOption(UUID id, String name, String city) {}
    public record CharacterRequest(@NotBlank(message = "Donnez un nom au personnage") @Size(max = 120) String name,
                                   @Size(max = 4000) String story, @Size(max = 4000) String brandWish,
                                   @Size(max = 4000) String agencyWish, @Size(max = 4000) String notes) {}
    public record CharacterView(UUID id, String name, String story, String brandWish, String agencyWish, String notes) {}
    public record Transmit(@NotNull(message = "Choisissez le réalisateur") UUID directorId, UUID firstAdId) {}
    public record Team(UUID directorId, UUID firstAdId) {}
    public record PersonOption(UUID id, String name, String organisation) {}
    public record SceneRequest(@NotBlank(message = "Donnez un titre à la scène") @Size(max = 160) String title, @Size(max = 4000) String description) {}
    public record SceneView(UUID id, String title, String description) {}
    public record RoleSheetRequest(UUID characterId, @NotBlank(message = "Donnez un nom au rôle") @Size(max = 120) String name,
                                   @Size(max = 4000) String intention, String gender, Integer minAge, Integer maxAge,
                                   @Size(max = 4000) String appearance, CastingRole.Importance importance) {}
    public record RoleSheetView(UUID id, UUID characterId, String characterName, String name, String intention, String gender,
                                Integer minAge, Integer maxAge, String appearance, CastingRole.Importance importance, UUID castingRoleId) {}
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
    private final AdSceneRepository scenes;
    private final AdRoleRepository roleSheets;
    private final ProjectRepository projects;
    private final ProjectMemberRepository members;
    private final CastingRoleRepository castingRoles;
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
        v.setLinkUrl(link(req.link()));
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
        if (v0 == null || !v0.hasContent()) {
            throw new IllegalArgumentException("Déposez votre V0 (un texte, un fichier ou le lien de votre présentation Canva) avant de l'envoyer");
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
        V0Analyzer.Result res = analyzer.analyse(r, v0.getBody(), fileText, v0.getFileName(), v0.getLinkUrl());
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
        v.setLinkUrl(link(req.link()));
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
        if (v == null || !v.hasContent()) throw new IllegalArgumentException("Écrivez votre V1, déposez un fichier ou donnez le lien de votre présentation Canva avant de la livrer");
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
        if (r.getProduction() != null) {
            notifyOrg(r.getAgency(), v.getLabel() + " validée : " + r.getTitle(), "La marque a validé votre " + v.getLabel() + ". " + r.getProduction().getName() + " prend la suite.", r);
            startV2(r, me);
        } else {
            notifyOrg(r.getAgency(), v.getLabel() + " validée : " + r.getTitle(), "La marque a validé votre " + v.getLabel() + ". Choisissez la boîte de production.", r);
        }
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
        if (!productionChoosable(r)) throw new IllegalArgumentException("La production se choisit une fois la demande acceptée, avant le début de la V2");
        Agency prod = agencies.findById(req.productionId()).filter(a -> "BOITE_PROD".equals(a.getKind()))
                .orElseThrow(() -> new IllegalArgumentException("Choisissez une boîte de production inscrite"));
        boolean change = r.getProduction() != null && !r.getProduction().getId().equals(prod.getId());
        if (change) { r.setDirector(null); r.setFirstAd(null); }   // l'équipe du réalisateur appartient à l'ancienne production
        r.setProduction(prod);
        if (r.getV1ValidatedAt() != null) {
            startV2(r, me);
        } else {
            // Rattachée tôt : la production suit la publicité en lecture jusqu'à la validation de la V1.
            log(r, me, "PRODUCTION", (change ? "Production changée : " : "Production rattachée : ") + prod.getName() + " suit la publicité jusqu'à la validation de la V1");
            notifyOrg(prod, "Publicité à venir : " + r.getTitle(), r.getAgency().getName() + " vous rattache à cette publicité. Suivez son avancement ; vous recueillerez les attentes dès que la marque aura validé la V1.", r);
        }
        notifyBrand(r, "Production choisie : " + r.getTitle(), r.getAgency().getName() + " a confié la production à " + prod.getName() + ".");
        return detail(me, r);
    }

    /** La production peut être choisie dès l'acceptation de la demande, et changée tant que la V2 n'a pas commencé. */
    private static boolean productionChoosable(AdRequest r) {
        return r.getStatus() == AdRequest.Status.V1_EN_COURS || r.getStatus() == AdRequest.Status.V1_LIVREE;
    }

    /** V1 validée et production choisie : la préparation de la V2 commence, la production est notifiée. */
    private void startV2(AdRequest r, User me) {
        r.setStatus(AdRequest.Status.V2_EN_COURS);
        log(r, me, "PRODUCTION", "Demande confiée à " + r.getProduction().getName() + " : recueil des attentes et V2 du réalisateur");
        notifyOrg(r.getProduction(), "À vous : " + r.getTitle(), "La V1 est validée. Recueillez les attentes sur les profils, personnage par personnage.", r);
        for (User u : team(r)) notifications.push(u.getId(), "DEMANDE", "V1 validée : " + r.getTitle(), "La production recueille maintenant les attentes ; vous les recevrez pour écrire la V2.", "/demandes/" + r.getId());
    }

    private static List<User> team(AdRequest r) {
        List<User> t = new java.util.ArrayList<>();
        if (r.getDirector() != null) t.add(r.getDirector());
        if (r.getFirstAd() != null) t.add(r.getFirstAd());
        return t;
    }

    /** La production rattache le réalisateur et le 1er AD quand elle veut : ils suivent la publicité en lecture
     *  et écriront la V2 une fois les attentes transmises. */
    @Transactional
    public Detail attachTeam(String email, UUID id, Team req) {
        User me = access.user(email);
        AdRequest r = visible(me, id);
        if (!isProductionSide(me, r)) throw new ForbiddenException("Seule la boîte de production rattache le réalisateur");
        if (!teamAttachable(r)) throw new IllegalArgumentException("L'équipe ne se modifie plus une fois la V2 publiée");
        User director = req.directorId() == null ? null : realisateur(req.directorId(), "Choisissez un réalisateur inscrit");
        User firstAd = req.firstAdId() == null ? null : realisateur(req.firstAdId(), "Choisissez un 1er AD inscrit");
        if (director == null && firstAd != null) throw new IllegalArgumentException("Choisissez d'abord le réalisateur");
        if (firstAd != null && firstAd.getId().equals(director.getId())) throw new IllegalArgumentException("Le 1er AD doit être une autre personne que le réalisateur");
        List<UUID> before = team(r).stream().map(User::getId).toList();
        r.setDirector(director); r.setFirstAd(firstAd);
        log(r, me, "EQUIPE", director == null ? "Réalisateur retiré" : "Équipe : " + name(director) + (firstAd == null ? "" : " (réalisateur) et " + name(firstAd) + " (1er AD)"));
        for (User u : team(r)) if (!before.contains(u.getId()))
            notifications.push(u.getId(), "DEMANDE", "Publicité à suivre : " + r.getTitle(),
                    r.getProduction().getName() + " vous rattache à cette publicité. Suivez son avancement ; vous écrirez la V2 une fois les attentes reçues.", "/demandes/" + r.getId());
        return detail(me, r);
    }

    private static boolean teamAttachable(AdRequest r) {
        return r.getProduction() != null && r.getV2PublishedAt() == null
                && (r.getStatus() == AdRequest.Status.V1_EN_COURS || r.getStatus() == AdRequest.Status.V1_LIVREE || r.getStatus() == AdRequest.Status.V2_EN_COURS);
    }

    private User realisateur(UUID id, String msg) {
        return users.findById(id).filter(u -> u.getRole() == Role.REALISATEUR && u.isEnabled()).orElseThrow(() -> new IllegalArgumentException(msg));
    }

    /** Qui a la main maintenant, et pour faire quoi : la même phrase pour toute l'équipe. */
    private String[] now(AdRequest r) {
        String agence = r.getAgency() == null ? "L'agence" : r.getAgency().getName();
        String prod = r.getProduction() == null ? "La production" : r.getProduction().getName();
        String real = r.getDirector() == null ? "Le réalisateur" : name(r.getDirector());
        return switch (r.getStatus()) {
            case BROUILLON -> new String[]{ "La marque", "écrit la V0 avant de l'envoyer à l'agence" };
            case V0_ENVOYEE -> new String[]{ agence, "lit la V0 pour l'accepter ou la refuser" };
            case V1_EN_COURS -> new String[]{ agence, "écrit la V1 (le concept)" };
            case V1_LIVREE -> r.getV1ValidatedAt() == null ? new String[]{ "La marque", "relit la V1 pour la valider ou demander une révision" }
                    : new String[]{ agence, "choisit la boîte de production" };
            case V2_EN_COURS -> r.getExpectationsSentAt() == null ? new String[]{ prod, "recueille les attentes sur les profils, personnage par personnage" }
                    : new String[]{ real, "écrit la V2 : scènes et fiches de rôle" };
            case V2_LIVREE, CASTING -> new String[]{ "AI Casting", "propose des acteurs pour chaque rôle" };
            case PPM -> new String[]{ "Toute l'équipe", "valide le casting, les décors et les costumes" };
            case ACTEURS_VALIDES -> new String[]{ "Toute l'équipe", "a validé les acteurs" };
            case CLOTUREE -> new String[]{ "", "Publicité clôturée" };
            case ANNULEE -> new String[]{ "", "Demande annulée" };
        };
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

    // ── Réalisateur et 1er AD : V2, scènes, fiches de rôle, publication (T-163) ──

    @Transactional
    public Detail saveV2Text(String email, UUID id, V0Text req) {
        User me = access.user(email);
        AdRequest r = v2Editable(me, id);
        AdVersion v = draftV2(r, me);
        v.setBody(req.body() == null || req.body().isBlank() ? null : req.body().trim());
        v.setLinkUrl(link(req.link()));
        versions.save(v);
        return detail(me, r);
    }

    @Transactional
    public Detail uploadV2File(String email, UUID id, MultipartFile file) {
        User me = access.user(email);
        AdRequest r = v2Editable(me, id);
        String name = storeFile(r, draftV2(r, me), file, "v2");
        log(r, me, "V2_FICHIER", "Fichier de la V2 déposé : " + name);
        return detail(me, r);
    }

    @Transactional
    public Detail removeV2File(String email, UUID id) {
        User me = access.user(email);
        AdRequest r = v2Editable(me, id);
        AdVersion v = draftV2(r, me);
        if (v.getFileKey() != null) { try { storage.delete(v.getFileKey()); } catch (Exception ignored) { } }
        v.setFileKey(null); v.setFileName(null); v.setFileType(null); v.setFileSize(null);
        versions.save(v);
        return detail(me, r);
    }

    @Transactional
    public Detail addScene(String email, UUID id, SceneRequest req) {
        User me = access.user(email);
        AdRequest r = v2Editable(me, id);
        AdScene x = new AdScene();
        x.setRequest(r); x.setPosition((int) scenes.countByRequestId(r.getId()));
        x.setTitle(req.title().trim()); x.setDescription(blank(req.description()));
        scenes.save(x);
        return detail(me, r);
    }

    @Transactional
    public Detail updateScene(String email, UUID id, UUID sceneId, SceneRequest req) {
        User me = access.user(email);
        AdRequest r = v2Editable(me, id);
        AdScene x = scenes.findById(sceneId).filter(y -> y.getRequest().getId().equals(r.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Scène introuvable"));
        x.setTitle(req.title().trim()); x.setDescription(blank(req.description()));
        scenes.save(x);
        return detail(me, r);
    }

    @Transactional
    public Detail deleteScene(String email, UUID id, UUID sceneId) {
        User me = access.user(email);
        AdRequest r = v2Editable(me, id);
        scenes.findById(sceneId).filter(y -> y.getRequest().getId().equals(r.getId())).ifPresent(scenes::delete);
        return detail(me, r);
    }

    @Transactional
    public Detail addRoleSheet(String email, UUID id, RoleSheetRequest req) {
        User me = access.user(email);
        AdRequest r = v2Editable(me, id);
        AdRole x = new AdRole();
        x.setRequest(r); x.setPosition((int) roleSheets.countByRequestId(r.getId()));
        fillRole(r, x, req);
        roleSheets.save(x);
        log(r, me, "ROLE", "Fiche de rôle ajoutée : " + x.getName());
        return detail(me, r);
    }

    @Transactional
    public Detail updateRoleSheet(String email, UUID id, UUID roleId, RoleSheetRequest req) {
        User me = access.user(email);
        AdRequest r = v2Editable(me, id);
        AdRole x = roleSheets.findById(roleId).filter(y -> y.getRequest().getId().equals(r.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Fiche de rôle introuvable"));
        fillRole(r, x, req);
        roleSheets.save(x);
        return detail(me, r);
    }

    @Transactional
    public Detail deleteRoleSheet(String email, UUID id, UUID roleId) {
        User me = access.user(email);
        AdRequest r = v2Editable(me, id);
        roleSheets.findById(roleId).filter(y -> y.getRequest().getId().equals(r.getId())).ifPresent(x -> {
            roleSheets.delete(x);
            log(r, me, "ROLE", "Fiche de rôle retirée : " + x.getName());
        });
        return detail(me, r);
    }

    /**
     * Publication de la V2 : la version est figée, un projet de casting « publicité » est créé avec un rôle par fiche
     * (intention et critères), le 1er AD et la production y sont associés ; les propositions d'acteurs peuvent commencer.
     */
    @Transactional
    public Detail publishV2(String email, UUID id) {
        User me = access.user(email);
        AdRequest r = v2Editable(me, id);
        List<AdRole> sheets = roleSheets.findByRequestIdOrderByPositionAscCreatedAtAsc(r.getId());
        if (sheets.isEmpty()) throw new IllegalArgumentException("Ajoutez au moins une fiche de rôle avant de publier la V2");
        List<String> noIntent = sheets.stream().filter(x -> x.getIntention() == null).map(AdRole::getName).toList();
        if (!noIntent.isEmpty()) throw new IllegalArgumentException("Écrivez l'intention de chaque rôle : " + String.join(", ", noIntent));
        AdVersion v2 = draftV2(r, me);
        if (!v2.hasContent() && scenes.countByRequestId(r.getId()) == 0) {
            throw new IllegalArgumentException("Écrivez la V2, déposez un fichier, donnez le lien Canva ou découpez au moins une scène avant de publier");
        }
        v2.setStatus(AdVersion.Status.LIVREE); v2.setDeliveredAt(LocalDateTime.now()); versions.save(v2);

        User owner = r.getDirector() != null ? r.getDirector() : me;
        Project p = Project.builder().owner(owner).title(cut(r.getTitle(), 160)).type(Project.Type.PUBLICITE)
                .description(projectDescription(r, v2)).build();
        p = projects.save(p);
        Set<UUID> team = new LinkedHashSet<>();
        if (r.getFirstAd() != null) team.add(r.getFirstAd().getId());
        if (!owner.getId().equals(me.getId())) team.add(me.getId());
        if (r.getProduction() != null) users.findAll().stream()
                .filter(u -> u.getAgency() != null && u.getAgency().getId().equals(r.getProduction().getId()) && u.isEnabled())
                .forEach(u -> team.add(u.getId()));
        team.remove(owner.getId());
        for (UUID u : team) members.save(new ProjectMember(p.getId(), u, LocalDateTime.now()));
        int pos = 0;
        for (AdRole x : sheets) {
            CastingRole cr = CastingRole.builder().project(p).position(pos++).name(x.getName())
                    .description(x.getAppearance()).intention(x.getIntention()).gender(x.getGender())
                    .minAge(x.getMinAge()).maxAge(x.getMaxAge()).importance(x.getImportance()).build();
            cr = castingRoles.save(cr);
            x.setCastingRole(cr); roleSheets.save(x);
        }
        r.setProject(p);
        r.setV2PublishedAt(LocalDateTime.now());
        r.setStatus(AdRequest.Status.CASTING);
        log(r, me, "V2_PUBLIEE", "V2 publiée par " + name(me) + " : " + sheets.size() + " rôle" + (sheets.size() > 1 ? "s" : "") + " au casting");
        String body = "La V2 est publiée : " + sheets.size() + " rôle" + (sheets.size() > 1 ? "s" : "") + ". Les propositions d'acteurs commencent.";
        notifyBrand(r, "V2 publiée : " + r.getTitle(), body);
        notifyOrg(r.getAgency(), "V2 publiée : " + r.getTitle(), body, r);
        notifyOrg(r.getProduction(), "V2 publiée : " + r.getTitle(), body, r);
        if (r.getFirstAd() != null && !r.getFirstAd().getId().equals(me.getId())) notifications.push(r.getFirstAd().getId(), "DEMANDE", "V2 publiée : " + r.getTitle(), body, "/demandes/" + r.getId());
        if (r.getDirector() != null && !r.getDirector().getId().equals(me.getId())) notifications.push(r.getDirector().getId(), "DEMANDE", "V2 publiée : " + r.getTitle(), body, "/demandes/" + r.getId());
        return detail(me, r);
    }

    private AdRequest v2Editable(User me, UUID id) {
        AdRequest r = visible(me, id);
        if (!isDirectorSide(me, r)) throw new ForbiddenException("Seuls le réalisateur et le 1er AD écrivent la V2");
        if (r.getStatus() != AdRequest.Status.V2_EN_COURS) throw new IllegalArgumentException("La V2 n'est plus modifiable");
        if (r.getExpectationsSentAt() == null) throw new IllegalArgumentException("La V2 s'écrit une fois les attentes de la production reçues");
        return r;
    }

    private AdVersion draftV2(AdRequest r, User me) {
        return versions.findFirstByRequestIdAndKindOrderByCreatedAtDesc(r.getId(), AdVersion.Kind.V2)
                .filter(x -> x.getStatus() == AdVersion.Status.BROUILLON).orElseGet(() -> {
                    AdVersion v = new AdVersion();
                    v.setRequest(r); v.setKind(AdVersion.Kind.V2); v.setLabel("V2"); v.setAuthor(me);
                    return versions.save(v);
                });
    }

    /** Les scènes et fiches de rôle sont visibles du réalisateur et du 1er AD pendant l'écriture, de tous une fois la V2 publiée. */
    private boolean seesV2(User me, AdRequest r) {
        return r.getV2PublishedAt() != null || isDirectorSide(me, r) || me.getRole() == Role.ADMIN;
    }

    private void fillRole(AdRequest r, AdRole x, RoleSheetRequest q) {
        if (q.gender() != null && !q.gender().isBlank() && !List.of("Femme", "Homme").contains(q.gender())) throw new IllegalArgumentException("Sexe : Femme ou Homme");
        if (q.minAge() != null && (q.minAge() < 0 || q.minAge() > 100) || q.maxAge() != null && (q.maxAge() < 0 || q.maxAge() > 100)) throw new IllegalArgumentException("L'âge va de 0 à 100 ans");
        if (q.minAge() != null && q.maxAge() != null && q.minAge() > q.maxAge()) throw new IllegalArgumentException("L'âge minimum dépasse l'âge maximum");
        AdCharacter c = q.characterId() == null ? null : characters.findById(q.characterId()).filter(y -> y.getRequest().getId().equals(r.getId()))
                .orElseThrow(() -> new IllegalArgumentException("Personnage introuvable"));
        x.setCharacter(c); x.setName(q.name().trim()); x.setIntention(blank(q.intention()));
        x.setGender(blank(q.gender())); x.setMinAge(q.minAge()); x.setMaxAge(q.maxAge()); x.setAppearance(blank(q.appearance()));
        x.setImportance(q.importance() == null ? CastingRole.Importance.SECONDAIRE : q.importance());
    }

    private RoleSheetView roleView(AdRole x) {
        return new RoleSheetView(x.getId(), x.getCharacter() == null ? null : x.getCharacter().getId(), x.getCharacter() == null ? null : x.getCharacter().getName(),
                x.getName(), x.getIntention(), x.getGender(), x.getMinAge(), x.getMaxAge(), x.getAppearance(), x.getImportance(),
                x.getCastingRole() == null ? null : x.getCastingRole().getId());
    }

    private static String projectDescription(AdRequest r, AdVersion v2) {
        StringBuilder sb = new StringBuilder("Publicité");
        if (r.getBrand() != null) sb.append(" pour ").append(r.getBrand().getName());
        if (r.getProduct() != null) sb.append(" (").append(r.getProduct()).append(")");
        sb.append(".");
        if (v2.getBody() != null) sb.append("\n\n").append(v2.getBody());
        return cut(sb.toString(), 4000);
    }

    private static String cut(String s, int n) { return s == null || s.length() <= n ? s : s.substring(0, n); }

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
        last.ifPresent(p -> { v.setBody(p.getBody()); v.setLinkUrl(p.getLinkUrl()); });
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
                .map(AdVersion::hasContent).orElse(false);
        return new Summary(r.getId(), r.getTitle(), r.getProduct(), r.getStatus(), r.getBrand() == null ? name(r.getCreatedBy()) : r.getBrand().getName(),
                r.getAgency() == null ? null : r.getAgency().getName(), r.getAirDate(), r.getUpdatedAt(), hasV0, now(r)[0], now(r)[1]);
    }

    private Detail detail(User me, AdRequest r) {
        List<VersionView> vs = versions.findByRequestIdOrderByCreatedAtAsc(r.getId()).stream()
                // l'agence ne voit une version qu'une fois livrée
                .filter(v -> v.getStatus() != AdVersion.Status.BROUILLON
                        || (v.getKind() == AdVersion.Kind.V0 ? isBrandSide(me, r) : v.getKind() == AdVersion.Kind.V1 ? isAgencySide(me, r) : isDirectorSide(me, r)))
                .map(v -> new VersionView(v.getId(), v.getKind(), v.getLabel(), v.getStatus(), v.getBody(), v.getFileName(), v.getFileType(),
                        v.getFileSize(), v.getAuthor() == null ? null : name(v.getAuthor()), v.getCreatedAt(), v.getDeliveredAt(),
                        v.getReviewComment(), v.getReviewedAt(), v.getLinkUrl())).toList();
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
                isAgencySide(me, r) && productionChoosable(r),
                r.getV1ValidatedAt() != null, r.getProduction() == null ? null : r.getProduction().getName(),
                isProductionSide(me, r) && r.getStatus() == AdRequest.Status.V2_EN_COURS,
                characters.findByRequestIdOrderByPositionAscCreatedAtAsc(r.getId()).stream()
                        .map(c -> new CharacterView(c.getId(), c.getName(), c.getStory(), c.getBrandWish(), c.getAgencyWish(), c.getNotes())).toList(),
                r.getDirector() == null ? null : name(r.getDirector()), r.getFirstAd() == null ? null : name(r.getFirstAd()),
                r.getExpectationsSentAt(),
                isDirectorSide(me, r) && r.getStatus() == AdRequest.Status.V2_EN_COURS && r.getExpectationsSentAt() != null,
                seesV2(me, r) ? scenes.findByRequestIdOrderByPositionAscCreatedAtAsc(r.getId()).stream()
                        .map(x -> new SceneView(x.getId(), x.getTitle(), x.getDescription())).toList() : List.of(),
                seesV2(me, r) ? roleSheets.findByRequestIdOrderByPositionAscCreatedAtAsc(r.getId()).stream().map(this::roleView).toList() : List.of(),
                r.getProject() == null || !(isDirectorSide(me, r) || isProductionSide(me, r)) ? null : r.getProject().getId(),
                r.getV2PublishedAt(), isProductionSide(me, r) && teamAttachable(r),
                isProductionSide(me, r) && r.getDirector() != null ? r.getDirector().getId() : null,
                isProductionSide(me, r) && r.getFirstAd() != null ? r.getFirstAd().getId() : null,
                now(r)[0], now(r)[1], vs, ev);
    }

    private static Analysis analysis(AdRequest r) {
        if (r.getAiAt() == null) return null;
        return new Analysis(r.getAiSummary(), lines(r.getAiMissing()), lines(r.getAiQuestions()), r.getAiSource(), r.getAiAt());
    }
    private static List<String> lines(String s) { return s == null || s.isBlank() ? List.of() : List.of(s.split("\n")); }

    /**
     * Lien de présentation accepté : https uniquement (Canva le plus souvent : canva.com/design/…/view, canva.link/…).
     * Un lien vide efface le lien ; une adresse qui n'est pas en https est refusée.
     */
    static String link(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String u = raw.trim();
        try {
            java.net.URI uri = new java.net.URI(u);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) throw new IllegalArgumentException();
        } catch (Exception e) {
            throw new IllegalArgumentException("Le lien doit être une adresse https, par exemple le lien « Partager » de votre présentation Canva");
        }
        return u;
    }

    private static String name(User u) { return (u.getFirstName() + " " + u.getLastName()).trim(); }
    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
