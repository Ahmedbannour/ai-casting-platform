package com.castingai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Projets de casting (MVP, sprint S3 · US-01 à US-03) sur une vraie base PostgreSQL jetable.
 * Le compte de démonstration est administrateur ; un second compte « utilisateur » est créé par inscription.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ProjectApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private String token(String email, String password) throws Exception {
        String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(java.util.Map.of("email", email, "password", password))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return "Bearer " + json.readTree(body).get("accessToken").asText();
    }

    private String admin() throws Exception { return token("ahmed@casting.com", "password123"); }

    /** Agence cliente commune aux agents créés par ce test. */
    private String agencyId() throws Exception {
        String a = admin();
        mvc.perform(post("/api/admin/agencies").header("Authorization", a).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Agence de test\",\"contractStart\":\"2026-01-01\"}"));
        JsonNode list = json.readTree(mvc.perform(get("/api/admin/agencies").header("Authorization", a))
                .andReturn().getResponse().getContentAsString());
        for (JsonNode x : list) if (x.get("name").asText().equals("Agence de test")) return x.get("id").asText();
        throw new IllegalStateException("Agence de test introuvable");
    }

    /** Crée (une fois, par l'administration) puis connecte un agent. */
    private String simpleUser(String email) throws Exception {
        mvc.perform(post("/api/admin/agents").header("Authorization", admin()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"agencyId\":\"" + agencyId() + "\",\"email\":\"" + email + "\",\"password\":\"motdepasse123\",\"firstName\":\"Yanis\",\"lastName\":\"Test\"}"));
        return token(email, "motdepasse123");
    }

    private JsonNode create(String auth, String body) throws Exception {
        String res = mvc.perform(post("/api/projects").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json.readTree(res);
    }

    @Test
    void creerListerLireModifierUnProjet() throws Exception {
        String auth = admin();
        JsonNode p = create(auth, """
            {"title":"Les Passagers","type":"LONG_METRAGE","description":"Drame","startDate":"2027-03-01","endDate":"2027-05-30"}""");
        assertThat(p.get("status").asText()).isEqualTo("EN_COURS");
        assertThat(p.get("owner").asBoolean()).isTrue();
        assertThat(p.get("rolesCount").asInt()).isZero();
        String id = p.get("id").asText();

        mvc.perform(get("/api/projects").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == '" + id + "')].title").value("Les Passagers"));

        mvc.perform(put("/api/projects/" + id).header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Les Passagers (titre provisoire)\",\"type\":\"SERIE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Les Passagers (titre provisoire)"))
                .andExpect(jsonPath("$.type").value("SERIE"));

        mvc.perform(get("/api/projects/" + id).header("Authorization", auth))
                .andExpect(status().isOk()).andExpect(jsonPath("$.type").value("SERIE"));
    }

    @Test
    void finAvantDebutOuTitreVideRefuses() throws Exception {
        String auth = admin();
        mvc.perform(post("/api/projects").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"X\",\"type\":\"PUBLICITE\",\"startDate\":\"2027-05-01\",\"endDate\":\"2027-04-01\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("La date de fin ne peut pas précéder la date de début"));
        mvc.perform(post("/api/projects").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"  \",\"type\":\"PUBLICITE\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/projects").header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"X\",\"type\":\"OPERA_ROCK\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void archiverPuisRestaurerEtFiltrerParEtat() throws Exception {
        String auth = admin();
        String id = create(auth, "{\"title\":\"Pub été\",\"type\":\"PUBLICITE\"}").get("id").asText();

        mvc.perform(post("/api/projects/" + id + "/archive").header("Authorization", auth))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ARCHIVE"));
        mvc.perform(get("/api/projects?status=EN_COURS").header("Authorization", auth))
                .andExpect(jsonPath("$[?(@.id == '" + id + "')]").isEmpty());
        mvc.perform(get("/api/projects?status=ARCHIVE").header("Authorization", auth))
                .andExpect(jsonPath("$[?(@.id == '" + id + "')]").isNotEmpty());

        mvc.perform(post("/api/projects/" + id + "/restore").header("Authorization", auth))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("EN_COURS"));
    }

    @Test
    void unUtilisateurNeVoitQueSesProjetsEtNePeutPasSupprimer() throws Exception {
        String adminAuth = admin();
        String adminProject = create(adminAuth, "{\"title\":\"Projet de l'admin\",\"type\":\"THEATRE\"}").get("id").asText();

        String user = simpleUser("yanis.s3@test.local");
        // invisible : 404, sans révéler l'existence du projet
        mvc.perform(get("/api/projects/" + adminProject).header("Authorization", user)).andExpect(status().isNotFound());
        mvc.perform(get("/api/projects").header("Authorization", user))
                .andExpect(jsonPath("$[?(@.id == '" + adminProject + "')]").isEmpty());

        String own = create(user, "{\"title\":\"Court de Yanis\",\"type\":\"COURT_METRAGE\"}").get("id").asText();
        mvc.perform(post("/api/projects/" + own + "/archive").header("Authorization", user)).andExpect(status().isOk());
        mvc.perform(delete("/api/projects/" + own).header("Authorization", user)).andExpect(status().isForbidden());

        // l'admin, lui, peut supprimer définitivement
        mvc.perform(delete("/api/projects/" + own).header("Authorization", adminAuth)).andExpect(status().isNoContent());
        mvc.perform(get("/api/projects/" + own).header("Authorization", adminAuth)).andExpect(status().isNotFound());
    }

    @Test
    void projetInconnuEtSansJeton() throws Exception {
        mvc.perform(get("/api/projects/" + UUID.randomUUID()).header("Authorization", admin()))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/projects")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/projects/pas-un-uuid").header("Authorization", admin()))
                .andExpect(status().isBadRequest());
    }
}
