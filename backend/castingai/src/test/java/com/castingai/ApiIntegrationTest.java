package com.castingai;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests de bout en bout de l'API sur une vraie base PostgreSQL jetable (Docker).
 * Le jeu de démonstration (100 acteurs + compte démo) est créé au démarrage.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ApiIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private JsonNode login() throws Exception {
        String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"ahmed@casting.com\",\"password\":\"password123\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    private String bearer() throws Exception {
        return "Bearer " + login().get("accessToken").asString();
    }

    private JsonNode getJson(String url, String auth) throws Exception {
        String body = mvc.perform(get(url).header("Authorization", auth))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    @Test
    void healthEstPublic() throws Exception {
        mvc.perform(get("/api/health")).andExpect(status().isOk());
    }

    @Test
    void sansJetonLApiRepond401() throws Exception {
        mvc.perform(get("/api/actors")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/actors").contentType(MediaType.APPLICATION_JSON)
                .content("{\"firstName\":\"X\",\"lastName\":\"Y\"}")).andExpect(status().isUnauthorized());
    }

    @Test
    void listeSansFiltreRenvoieTousLesActeurs() throws Exception {
        JsonNode page = getJson("/api/actors/search?size=20", bearer());
        assertThat(page.get("totalElements").asInt()).isGreaterThanOrEqualTo(100);
        assertThat(page.get("content").size()).isEqualTo(20);
    }

    @Test
    void vivierFiltresCombinesEtPagesBornees() throws Exception {
        String auth = bearer();
        JsonNode facets = getJson("/api/actors/facets", auth);
        assertThat(facets.get("languages").size()).isGreaterThan(0);
        assertThat(facets.get("skills").size()).isGreaterThan(0);
        int tous = getJson("/api/actors/search?size=1", auth).get("totalElements").asInt();
        int fr = getJson("/api/actors/search?size=1&languages=français", auth).get("totalElements").asInt();
        int frEtDanse = getJson("/api/actors/search?size=1&languages=Français&skills=Danse", auth).get("totalElements").asInt();
        int inconnue = getJson("/api/actors/search?size=1&languages=klingon", auth).get("totalElements").asInt();
        assertThat(fr).isPositive().isLessThanOrEqualTo(tous);
        assertThat(frEtDanse).isPositive().isLessThanOrEqualTo(fr);
        assertThat(inconnue).isZero();
        JsonNode grands = getJson("/api/actors/search?size=100&minHeight=175&maxHeight=185&minAge=20&maxAge=40", auth).get("content");
        for (JsonNode a : grands) {
            assertThat(a.get("height").asInt()).isBetween(175, 185);
            assertThat(a.get("age").asInt()).isBetween(20, 40);
        }
        assertThat(getJson("/api/actors/search?size=5000", auth).get("size").asInt()).isEqualTo(100);
    }

    @Test
    void triParAgeCroissant() throws Exception {
        JsonNode content = getJson("/api/actors/search?sortBy=age&sortDir=asc&size=30", bearer()).get("content");
        int previous = 0;
        for (JsonNode a : content) {
            if (a.get("age").isNull()) continue;
            assertThat(a.get("age").asInt()).isGreaterThanOrEqualTo(previous);
            previous = a.get("age").asInt();
        }
    }

    @Test
    void statistiquesReelles() throws Exception {
        JsonNode stats = getJson("/api/dashboard/stats", bearer());
        assertThat(stats.get("totalActors").asLong()).isGreaterThanOrEqualTo(100);
        assertThat(stats.get("totalPhotos").asLong()).isGreaterThan(0);
    }

    @Test
    void deuxSessionsCoexistent() throws Exception {
        String refresh1 = login().get("refreshToken").asString();
        login(); // une deuxième connexion ne doit pas invalider la première
        mvc.perform(post("/api/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                .content("{\"refreshToken\":\"" + refresh1 + "\"}")).andExpect(status().isOk());
    }

    @Test
    void rechercheIaScoreHonnete() throws Exception {
        // T-131 · Une ville du vivier est comprise ; une fiche d'une autre ville n'a jamais 100 % et le dit
        String auth = bearer();
        JsonNode one = getJson("/api/actors/search?size=1&sortBy=city", auth).get("content").get(0);
        String ville = one.get("city").asString();
        String q = "{\"query\":\"actrice qui parle anglais à " + ville.toLowerCase() + "\",\"page\":0,\"size\":30}";
        JsonNode r = json.readTree(mvc.perform(post("/api/ai/search").header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON).content(q)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(r.get("results").size()).isPositive();
        boolean ailleurs = false;
        for (JsonNode a : r.get("results")) {
            boolean memeVille = a.get("city").asString().equalsIgnoreCase(ville);
            JsonNode villeCheck = null;
            for (JsonNode c : a.get("checks")) if (c.get("label").asString().contains(ville) || c.get("label").asString().contains("Ville")) villeCheck = c;
            assertThat(villeCheck).as("critère de ville affiché").isNotNull();
            assertThat(villeCheck.get("ok").asBoolean()).isEqualTo(memeVille);
            if (!memeVille) { ailleurs = true; assertThat(a.get("score").asDouble()).isLessThan(1.0); }
        }
        // Une fiche de la ville demandée qui remplit tout est à 100 % ; les autres le disent
        assertThat(ailleurs).as("au moins une fiche d'une autre ville, signalée").isTrue();
    }

    @Test
    void rechercheIaPagineeEtFiltree() throws Exception {
        String auth = bearer();
        String q = "{\"query\":\"femme entre 25 et 35 ans parlant anglais\",\"page\":0,\"size\":5}";
        String body = mvc.perform(post("/api/ai/search").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(q))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode r = json.readTree(body);
        assertThat(r.get("results").size()).isLessThanOrEqualTo(5);
        for (JsonNode a : r.get("results")) {
            assertThat(a.get("gender").asString()).isEqualTo("Femme");
            assertThat(a.get("age").asInt()).isBetween(25, 35);
        }
    }

    @Test
    void modificationConserveLesExperiences() throws Exception {
        String auth = bearer();
        String created = mvc.perform(post("/api/actors").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"firstName\":\"Test\",\"lastName\":\"Experiences\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = json.readTree(created).get("id").asString();

        mvc.perform(put("/api/actors/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"experiences\":[{\"title\":\"Rôle A\",\"year\":2024},{\"title\":\"Rôle B\",\"year\":2025}]}"))
                .andExpect(status().isOk());

        JsonNode detail = getJson("/api/actors/" + id + "/detail", auth);
        assertThat(detail.get("experiences").size()).isEqualTo(2);
    }
}
