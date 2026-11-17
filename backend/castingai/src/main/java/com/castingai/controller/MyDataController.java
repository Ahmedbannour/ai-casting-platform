package com.castingai.controller;

import com.castingai.entity.User;
import com.castingai.exception.ForbiddenException;
import com.castingai.repository.UserRepository;
import com.castingai.service.MyDataService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

/** T-110 · « Mes données » : export (ZIP) et suppression du compte acteur. */
@RestController
@RequiredArgsConstructor
public class MyDataController {

    private final MyDataService myData;
    private final UserRepository users;

    @GetMapping("/api/me/export")
    public ResponseEntity<byte[]> export(@AuthenticationPrincipal UserDetails me) throws Exception {
        byte[] zip = myData.export(user(me));
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/zip"))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename("mes-donnees-ai-casting-" + LocalDate.now() + ".zip").build().toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(zip);
    }

    @PostMapping("/api/me/delete")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UserDetails me, @RequestBody Map<String, String> body) {
        myData.delete(user(me), body == null ? null : body.get("password"), body == null ? null : body.get("confirm"));
        return ResponseEntity.noContent().build();
    }

    private User user(UserDetails me) {
        if (me == null) throw new ForbiddenException("Connexion requise");
        return users.findByEmail(me.getUsername()).orElseThrow(() -> new ForbiddenException("Compte introuvable"));
    }
}
