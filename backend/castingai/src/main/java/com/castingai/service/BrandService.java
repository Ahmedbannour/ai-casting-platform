package com.castingai.service;

import com.castingai.entity.Agency;
import com.castingai.entity.Project;
import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.exception.ForbiddenException;
import com.castingai.exception.ResourceNotFoundException;
import com.castingai.repository.AgencyRepository;
import com.castingai.storage.StorageService;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Image de marque de la boîte de production, réglée par le producer : nom affiché, couleur principale, logo.
 * Son équipe la voit partout ; ses invités (marque, agence, réalisateur) la voient dans ses rooms et ses invitations.
 */
@Service
@RequiredArgsConstructor
public class BrandService {

    private static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Map<String, String> LOGO_TYPES = Map.of("image/png", "png", "image/jpeg", "jpg", "image/webp", "webp");
    private static final long LOGO_MAX = 1024 * 1024;

    private final AccessService access;
    private final AgencyRepository agencies;
    private final StorageService storage;
    private final AuditService audit;

    /** Ce que l'interface applique : null quand la boîte n'a rien réglé. */
    public record Brand(UUID orgId, String name, String color, String logoUrl) {}
    public record BrandRequest(@Size(max = 160, message = "Nom : 160 caractères au plus") String name, String color) {}
    public record Logo(byte[] bytes, String type) {}

    /** L'image de marque d'une boîte de production, ou null. */
    public static Brand of(Agency a) {
        if (a == null || !"BOITE_PROD".equals(a.getKind())) return null;
        boolean set = a.getBrandColor() != null || a.getBrandLogoKey() != null || a.getBrandName() != null;
        if (!set) return null;
        String logo = a.getBrandLogoKey() == null ? null : "/public/marques/" + a.getId() + "/logo?v="
                + (a.getBrandUpdatedAt() == null ? 0 : a.getBrandUpdatedAt().toEpochSecond(ZoneOffset.UTC));
        return new Brand(a.getId(), a.getBrandName() != null ? a.getBrandName() : a.getName(), a.getBrandColor(), logo);
    }

    /** L'image de marque d'un compte : celle de sa boîte de production. */
    public static Brand of(User u) { return u == null ? null : of(u.getAgency()); }

    /** L'image de marque d'une room : celle de la boîte du propriétaire du projet. */
    public static Brand of(Project p) { return p == null ? null : of(p.getOwner().getAgency()); }

    @Transactional(readOnly = true)
    public Brand mine(String email) {
        User me = access.user(email);
        Agency a = me.getAgency();
        if (a == null || !"BOITE_PROD".equals(a.getKind())) throw new ForbiddenException("Réservé à une boîte de production");
        Brand b = of(a);
        return b != null ? b : new Brand(a.getId(), a.getName(), null, null);
    }

    @Transactional
    public Brand update(String email, BrandRequest req) {
        Agency a = producerOrg(email);
        String color = req.color() == null || req.color().isBlank() ? null : req.color().trim();
        if (color != null && !HEX.matcher(color).matches()) throw new IllegalArgumentException("Choisissez une couleur au format #RRGGBB");
        String name = req.name() == null || req.name().isBlank() ? null : req.name().trim();
        a.setBrandColor(color == null ? null : color.toUpperCase());
        a.setBrandName(name);
        a.setBrandUpdatedAt(LocalDateTime.now());
        agencies.save(a);
        audit.log("IMAGE_DE_MARQUE", a.getName(), (name == null ? "nom de la boîte" : name) + " · " + (color == null ? "couleur Cercle" : color));
        return mine(email);
    }

    @Transactional
    public Brand uploadLogo(String email, MultipartFile file) {
        Agency a = producerOrg(email);
        String ext = file == null ? null : LOGO_TYPES.get(file.getContentType());
        if (ext == null) throw new IllegalArgumentException("Logo : PNG, JPG ou WebP");
        if (file.getSize() > LOGO_MAX) throw new IllegalArgumentException("Logo : 1 Mo au plus");
        String key = "marques/" + a.getId() + "/logo-" + System.currentTimeMillis() + "." + ext;
        try { storage.upload(file, key); } catch (Exception e) { throw new IllegalStateException("Envoi du logo impossible pour le moment", e); }
        dropLogo(a);
        a.setBrandLogoKey(key);
        a.setBrandLogoType(file.getContentType());
        a.setBrandUpdatedAt(LocalDateTime.now());
        agencies.save(a);
        return mine(email);
    }

    @Transactional
    public Brand removeLogo(String email) {
        Agency a = producerOrg(email);
        dropLogo(a);
        a.setBrandLogoKey(null); a.setBrandLogoType(null); a.setBrandUpdatedAt(LocalDateTime.now());
        agencies.save(a);
        return mine(email);
    }

    /** Le logo est public : il s'affiche aussi sur les pages d'invitation, avant toute connexion. */
    @Transactional(readOnly = true)
    public Logo logo(UUID orgId) {
        Agency a = agencies.findById(orgId).filter(x -> x.getBrandLogoKey() != null).orElseThrow(() -> new ResourceNotFoundException("Logo introuvable"));
        try { return new Logo(storage.download(a.getBrandLogoKey()), a.getBrandLogoType()); }
        catch (Exception e) { throw new ResourceNotFoundException("Logo introuvable"); }
    }

    private void dropLogo(Agency a) {
        if (a.getBrandLogoKey() != null) { try { storage.delete(a.getBrandLogoKey()); } catch (Exception ignored) { } }
    }

    private Agency producerOrg(String email) {
        User me = access.user(email);
        if (me.getRole() != Role.BOITE_PROD || me.getAgency() == null) throw new ForbiddenException("Seul le producer règle l'image de marque");
        return me.getAgency();
    }
}
