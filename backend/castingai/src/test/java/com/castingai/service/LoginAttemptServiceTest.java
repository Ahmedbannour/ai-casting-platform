package com.castingai.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** T-107 · Limitation des essais de mot de passe en série. */
class LoginAttemptServiceTest {

    private AuditService audit;
    private LoginAttemptService svc;
    private Instant now = Instant.parse("2026-11-17T10:00:00Z");

    @BeforeEach
    void setUp() {
        audit = mock(AuditService.class);
        svc = new LoginAttemptService(audit);
        svc.clock = new Clock() {
            public ZoneOffset getZone() { return ZoneOffset.UTC; }
            public Clock withZone(java.time.ZoneId z) { return this; }
            public Instant instant() { return now; }
        };
    }

    @Test
    void cinqEchecsBloquentLAdresseQuinzeMinutes() {
        for (int i = 0; i < 4; i++) { svc.checkAllowed("Nora@Test.tn", "1.1.1.1"); svc.onFailure("nora@test.tn", "1.1.1.1"); }
        svc.checkAllowed("nora@test.tn", "1.1.1.1");          // 4 échecs : encore permis
        svc.onFailure("nora@test.tn", "1.1.1.1");              // 5e échec : bloqué
        var ex = assertThrows(ResponseStatusException.class, () -> svc.checkAllowed("NORA@test.tn", "2.2.2.2"));
        assertEquals(429, ex.getStatusCode().value());
        assertTrue(ex.getReason().contains("15 minutes"), ex.getReason());
        verify(audit, times(1)).log(eq("CONNEXION_BLOQUEE"), eq("nora@test.tn"), anyString());
        svc.checkAllowed("autre@test.tn", "2.2.2.2");          // une autre adresse n'est pas touchée
        now = now.plus(Duration.ofMinutes(15)).plusSeconds(1);
        svc.checkAllowed("nora@test.tn", "1.1.1.1");          // la fenêtre est passée
    }

    @Test
    void vingtEchecsDepuisUneMachineBloquentLaMachine() {
        for (int i = 0; i < 20; i++) svc.onFailure("compte" + i + "@test.tn", "9.9.9.9");
        assertThrows(ResponseStatusException.class, () -> svc.checkAllowed("nouveau@test.tn", "9.9.9.9"));
        svc.checkAllowed("nouveau@test.tn", "8.8.8.8");
    }

    @Test
    void uneConnexionReussieRemetLeCompteurAZero() {
        for (int i = 0; i < 4; i++) svc.onFailure("sami@test.tn", "1.1.1.1");
        svc.onSuccess("sami@test.tn");
        for (int i = 0; i < 4; i++) svc.onFailure("sami@test.tn", "1.1.1.1");
        svc.checkAllowed("sami@test.tn", "3.3.3.3");
        verifyNoInteractions(audit);
    }
}
