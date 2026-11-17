package com.castingai.config;

import org.junit.jupiter.api.Test;
import java.util.Base64;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

/** T-106 · La production refuse les secrets absents, faibles ou de développement. */
class ProductionGuardTest {

    private static final String STRONG_JWT = Base64.getEncoder().encodeToString(new byte[48]).replace('A', 'Q');

    @Test
    void secretsDeDeveloppementRefuses() {
        List<String> p = ProductionGuard.check(
                "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970",
                "casting_pass", "minio_admin", "minio_password");
        assertEquals(4, p.size(), p.toString());
        assertTrue(p.get(0).contains("JWT_SECRET"));
    }

    @Test
    void secretsAbsentsOuTropCourtsRefuses() {
        List<String> p = ProductionGuard.check("", "court", "", Base64.getEncoder().encodeToString(new byte[8]));
        assertEquals(4, p.size(), p.toString());
        assertTrue(ProductionGuard.check(Base64.getEncoder().encodeToString(new byte[16]), "x".repeat(20), "acces-solide", "s".repeat(20))
                .get(0).contains("trop court"));
    }

    @Test
    void secretsSolidesAcceptes() {
        assertTrue(ProductionGuard.check(STRONG_JWT, "Un-Mot-De-Passe-Solide-2026", "acces-prod-01", "Secret-De-Stockage-Long-2026").isEmpty());
    }
}
