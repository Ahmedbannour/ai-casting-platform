package com.castingai.service;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * T-107 · Limite les essais de mot de passe en série.
 * Par adresse e-mail : 5 échecs en 15 minutes. Par machine (adresse IP) : 20 échecs en 15 minutes,
 * plus large pour ne pas bloquer tout un bureau derrière une même connexion.
 * Au-delà, la connexion est refusée (HTTP 429) jusqu'à ce que le plus ancien échec sorte de la fenêtre.
 * Mémoire locale au serveur : suffisant pour une seule instance (à partager si plusieurs instances).
 */
@Service
@RequiredArgsConstructor
public class LoginAttemptService {

    static final int MAX_PER_EMAIL = 5;
    static final int MAX_PER_IP = 20;
    static final long WINDOW_MS = 15 * 60 * 1000L;

    private final AuditService audit;
    private final Map<String, Deque<Long>> failures = new ConcurrentHashMap<>();
    Clock clock = Clock.systemUTC();

    /** Refuse la tentative si l'adresse ou la machine a atteint sa limite. */
    public void checkAllowed(String email, String ip) {
        long wait = Math.max(remaining(emailKey(email), MAX_PER_EMAIL), remaining(ipKey(ip), MAX_PER_IP));
        if (wait > 0) {
            long minutes = Math.max(1, (wait + 59_999) / 60_000);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Trop de tentatives de connexion. Par sécurité, réessayez dans " + minutes + " minute" + (minutes > 1 ? "s" : "") + ".");
        }
    }

    public void onFailure(String email, String ip) {
        boolean emailNowBlocked = add(emailKey(email), MAX_PER_EMAIL);
        boolean ipNowBlocked = add(ipKey(ip), MAX_PER_IP);
        if (emailNowBlocked || ipNowBlocked) {
            try {
                audit.log("CONNEXION_BLOQUEE", norm(email),
                        (emailNowBlocked ? MAX_PER_EMAIL + " échecs pour cette adresse" : MAX_PER_IP + " échecs depuis cette machine")
                                + " en 15 min · IP " + ip);
            } catch (RuntimeException ignored) {
                // le journal ne doit jamais empêcher le refus
            }
        }
    }

    public void onSuccess(String email) { failures.remove(emailKey(email)); }

    /** Ajoute un échec ; true si la limite vient d'être atteinte. */
    private boolean add(String key, int max) {
        long now = clock.millis();
        Deque<Long> q = failures.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (q) {
            prune(q, now);
            q.addLast(now);
            return q.size() == max;
        }
    }

    /** Millisecondes avant de pouvoir réessayer (0 si autorisé). */
    private long remaining(String key, int max) {
        Deque<Long> q = failures.get(key);
        if (q == null) return 0;
        long now = clock.millis();
        synchronized (q) {
            prune(q, now);
            if (q.isEmpty()) { failures.remove(key, q); return 0; }
            return q.size() >= max ? q.peekFirst() + WINDOW_MS - now : 0;
        }
    }

    private static void prune(Deque<Long> q, long now) {
        while (!q.isEmpty() && q.peekFirst() <= now - WINDOW_MS) q.pollFirst();
    }

    private static String norm(String email) { return email == null ? "" : email.trim().toLowerCase(Locale.ROOT); }
    private static String emailKey(String email) { return "e:" + norm(email); }
    private static String ipKey(String ip) { return "i:" + (ip == null ? "?" : ip); }
}
