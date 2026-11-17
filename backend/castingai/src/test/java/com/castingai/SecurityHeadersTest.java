package com.castingai;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** T-108 · En-têtes de sécurité et origines autorisées. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class SecurityHeadersTest {

    @Container @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));

    @Autowired MockMvc mvc;

    @Test
    void reponsesDeLApiAvecEnTetesDeSecurite() throws Exception {
        mvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"))
                .andExpect(header().string("Content-Security-Policy", org.hamcrest.Matchers.containsString("frame-ancestors 'none'")))
                .andExpect(header().string("Permissions-Policy", org.hamcrest.Matchers.containsString("camera=()")));
    }

    @Test
    void hstsSeulementEnHttps() throws Exception {
        mvc.perform(get("/api/health").secure(true))
                .andExpect(header().string("Strict-Transport-Security", org.hamcrest.Matchers.containsString("max-age=31536000")));
        mvc.perform(get("/api/health")).andExpect(header().doesNotExist("Strict-Transport-Security"));
    }

    @Test
    void origineInconnueRefusee_origineDuSiteAcceptee() throws Exception {
        mvc.perform(options("/api/health").header("Origin", "https://site-malveillant.example")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden());
        mvc.perform(options("/api/health").header("Origin", "http://localhost:4200")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:4200"));
    }
}
