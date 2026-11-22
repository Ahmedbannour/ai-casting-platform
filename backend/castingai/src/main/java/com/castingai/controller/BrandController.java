package com.castingai.controller;

import com.castingai.service.BrandService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;
import java.util.UUID;

/** Image de marque de la boîte de production (réglée par le producer) et son logo public. */
@RestController
@RequiredArgsConstructor
public class BrandController {

    private final BrandService brands;

    @GetMapping("/api/production/marque")
    public BrandService.Brand mine(@AuthenticationPrincipal UserDetails me) { return brands.mine(me.getUsername()); }

    @PutMapping("/api/production/marque")
    public BrandService.Brand update(@AuthenticationPrincipal UserDetails me, @Valid @RequestBody BrandService.BrandRequest req) {
        return brands.update(me.getUsername(), req);
    }

    @PostMapping(value = "/api/production/marque/logo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public BrandService.Brand logo(@AuthenticationPrincipal UserDetails me, @RequestParam("file") MultipartFile file) {
        return brands.uploadLogo(me.getUsername(), file);
    }

    @DeleteMapping("/api/production/marque/logo")
    public BrandService.Brand removeLogo(@AuthenticationPrincipal UserDetails me) { return brands.removeLogo(me.getUsername()); }

    @GetMapping("/api/public/marques/{orgId}/logo")
    public ResponseEntity<byte[]> publicLogo(@PathVariable UUID orgId) {
        BrandService.Logo l = brands.logo(orgId);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(l.type()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePublic())
                .header("X-Content-Type-Options", "nosniff").body(l.bytes());
    }
}
