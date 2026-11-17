package com.castingai.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * T-101 · Consentement aux conditions d'utilisation (CGU) et à la politique de confidentialité.
 * Chaque accord est daté, lié à la version des textes en vigueur, et indique si la personne est majeure
 * ou, sinon, le nom du représentant légal qui donne son accord.
 */
@Service
@RequiredArgsConstructor
public class ConsentService {

    /** Version des textes en vigueur (date de publication). La changer redemande l'accord de tous. */
    public static final String VERSION = "2026-11-17";

    private final JdbcTemplate jdbc;

    public record Status(String version, boolean required, Long acceptedAt) {}

    public record Request(Boolean accept, String age, String guardianName) {}

    public Status status(UUID userId) {
        Long at = jdbc.query("""
                select (extract(epoch from (min(accepted_at) at time zone current_setting('TimeZone'))) * 1000)::bigint
                  from consents where user_id = ? and version = ? having count(distinct document) = 2""",
                rs -> rs.next() ? rs.getLong(1) : null, userId, VERSION);
        return new Status(VERSION, at == null, at);
    }

    /** Vérifie la demande ; message clair en cas de refus. */
    public static void validate(Request r) {
        if (r == null || !Boolean.TRUE.equals(r.accept()))
            throw new IllegalArgumentException("Pour créer un compte, acceptez les conditions d'utilisation et la politique de confidentialité.");
        if (!"MAJEUR".equals(r.age()) && !"MINEUR".equals(r.age()))
            throw new IllegalArgumentException("Indiquez si vous avez 18 ans ou plus.");
        if ("MINEUR".equals(r.age()) && (r.guardianName() == null || r.guardianName().trim().length() < 3))
            throw new IllegalArgumentException("Pour un acteur mineur, indiquez le nom du représentant légal qui donne son accord.");
    }

    @Transactional
    public Status record(UUID userId, Request r, String source) {
        validate(r);
        String guardian = "MINEUR".equals(r.age()) ? r.guardianName().trim() : null;
        for (String doc : new String[] { "CGU", "CONFIDENTIALITE" }) {
            jdbc.update("insert into consents (id, user_id, document, version, source, age_statement, guardian_name) values (?, ?, ?, ?, ?, ?, ?)",
                    UUID.randomUUID(), userId, doc, VERSION, source, r.age(), guardian);
        }
        return status(userId);
    }
}
