package com.castingai.config;

import com.castingai.entity.Role;
import com.castingai.entity.User;
import com.castingai.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * T-106 · Premier administrateur en production, créé à partir de variables d'environnement
 * (CASTING_ADMIN_EMAIL, CASTING_ADMIN_PASSWORD) si aucun administrateur n'existe encore.
 * Aucun mot de passe n'est écrit dans le journal.
 */
@Slf4j
@Component
@Profile("prod")
@RequiredArgsConstructor
public class AdminBootstrap implements ApplicationRunner {

    private final UserRepository users;
    private final PasswordEncoder encoder;

    @Value("${casting.admin.email:}") String email;
    @Value("${casting.admin.password:}") String password;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (users.existsByRole(Role.ADMIN)) return;
        if (email.isBlank() || password.length() < 12) {
            log.warn("Aucun administrateur : définissez CASTING_ADMIN_EMAIL et CASTING_ADMIN_PASSWORD (12 caractères au moins), puis redémarrez.");
            return;
        }
        users.save(User.builder().email(email.trim().toLowerCase()).password(encoder.encode(password))
                .firstName("Administrateur").lastName("Plateforme").role(Role.ADMIN).enabled(true).emailVerifiedAt(java.time.LocalDateTime.now()).build());
        log.info("Premier administrateur créé : {}", email.trim().toLowerCase());
    }
}
