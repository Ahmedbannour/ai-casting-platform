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
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Équipe du projet, journal d'activité et disponibilités (MVP, sprint S6). */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class TeamApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private String token(String email, String password) throws Exception {
        String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", email, "password", password))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return "Bearer " + json.readTree(body).get("accessToken").asString();
    }

    private String admin() throws Exception { return token("ahmed@casting.com", "password123"); }

    /** Agence cliente commune aux agents créés par ce test. */
    private String agencyId() throws Exception {
        String a = admin();
        mvc.perform(post("/api/admin/agencies").header("Authorization", a).contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Agence de test\",\"contractStart\":\"2026-01-01\"}"));
        JsonNode list = json.readTree(mvc.perform(get("/api/admin/agencies").header("Authorization", a))
                .andReturn().getResponse().getContentAsString());
        for (JsonNode x : list) if (x.get("name").asString().equals("Agence de test")) return x.get("id").asString();
        throw new IllegalStateException("Agence de test introuvable");
    }

    private String user(String email) throws Exception {
        mvc.perform(post("/api/admin/agents").header("Authorization", admin()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"agencyId\":\"" + agencyId() + "\",\"email\":\"" + email + "\",\"password\":\"motdepasse123\",\"firstName\":\"Yanis\",\"lastName\":\"Equipe\"}"));
        return token(email, "motdepasse123");
    }

    private ResultActions send(String method, String url, String a, Object body) throws Exception {
        var req = switch (method) { case "POST" -> post(url); case "PATCH" -> patch(url); case "DELETE" -> delete(url); default -> get(url); };
        req.header("Authorization", a);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body instanceof String s ? s : json.writeValueAsString(body));
        return mvc.perform(req);
    }

    private JsonNode read(ResultActions r) throws Exception { return json.readTree(r.andReturn().getResponse().getContentAsString()); }

    private String project(String a, String title) throws Exception {
        return read(send("POST", "/api/projects", a, Map.of("title", title, "type", "SERIE")).andExpect(status().isCreated())).get("id").asString();
    }

    @Test
    void inviterUnCollegueQuiVoitAlorsLeProjet() throws Exception {
        String a = admin(), p = project(a, "Série équipe");
        String yanis = user("yanis.s6@test.local");
        send("GET", "/api/projects/" + p, yanis, null).andExpect(status().isNotFound());

        send("POST", "/api/projects/" + p + "/members", a, Map.of("email", "yanis.s6@test.local"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.owner").value(false));
        send("POST", "/api/projects/" + p + "/members", a, Map.of("email", "yanis.s6@test.local")).andExpect(status().isConflict());
        send("POST", "/api/projects/" + p + "/members", a, Map.of("email", "personne@nulle.part")).andExpect(status().isNotFound());
        send("POST", "/api/projects/" + p + "/members", a, Map.of("email", "pas-un-email")).andExpect(status().isBadRequest());

        JsonNode team = read(send("GET", "/api/projects/" + p + "/members", a, null).andExpect(status().isOk()));
        assertThat(team.size()).isEqualTo(2);
        assertThat(team.get(0).get("owner").asBoolean()).isTrue();

        // le membre voit le projet et sa liste, mais ne gère pas l'équipe
        send("GET", "/api/projects/" + p, yanis, null).andExpect(status().isOk());
        send("GET", "/api/projects", yanis, null).andExpect(jsonPath("$[?(@.id == '" + p + "')]").isNotEmpty());
        send("POST", "/api/projects/" + p + "/members", yanis, Map.of("email", "ahmed@casting.com")).andExpect(status().isForbidden());

        // il peut se retirer lui-même ; le propriétaire ne peut pas être retiré
        String ownerId = team.get(0).get("userId").asString(), yanisId = team.get(1).get("userId").asString();
        send("DELETE", "/api/projects/" + p + "/members/" + ownerId, a, null).andExpect(status().isForbidden());
        send("DELETE", "/api/projects/" + p + "/members/" + yanisId, yanis, null).andExpect(status().isNoContent());
        send("GET", "/api/projects/" + p, yanis, null).andExpect(status().isNotFound());
    }

    @Test
    void journalDActiviteDuProjet() throws Exception {
        String a = admin(), p = project(a, "Projet journal");
        String r = read(send("POST", "/api/projects/" + p + "/roles", a, Map.of("name", "Léa"))).get("id").asString();
        String actor = read(send("GET", "/api/actors/search?size=1", a, null)).get("content").get(0).get("id").asString();
        String e = read(send("POST", "/api/roles/" + r + "/shortlist", a, Map.of("actorId", actor))).get("id").asString();
        send("PATCH", "/api/shortlist/" + e, a, "{\"status\":\"AUDITION\"}").andExpect(status().isOk());

        JsonNode log = read(send("GET", "/api/projects/" + p + "/activity", a, null).andExpect(status().isOk()));
        assertThat(log.size()).isEqualTo(2);
        assertThat(log.get(0).get("toStatus").asString()).isEqualTo("AUDITION");      // le plus récent d'abord
        assertThat(log.get(0).get("fromStatus").asString()).isEqualTo("PRESELECTIONNE");
        assertThat(log.get(0).get("roleName").asString()).isEqualTo("Léa");
        assertThat(log.get(1).get("fromStatus").isNull()).isTrue();                    // ajout initial
    }

    @Test
    void disponibiliteCompareeAuxDatesDeTournage() throws Exception {
        String a = admin(), p = project(a, "Projet dispo");
        String r = read(send("POST", "/api/projects/" + p + "/roles", a,
                Map.of("name", "Marc", "shootStart", "2027-03-01", "shootEnd", "2027-03-10"))).get("id").asString();
        String libre = read(send("POST", "/api/actors", a, """
            {"firstName":"Libre","lastName":"Test","gender":"Homme","city":"Paris",
             "availabilities":[{"fromDate":"2027-02-01","toDate":"2027-04-01"}]}""").andExpect(status().is2xxSuccessful())).get("id").asString();
        String occupe = read(send("POST", "/api/actors", a, """
            {"firstName":"Occupe","lastName":"Test","gender":"Homme","city":"Paris",
             "availabilities":[{"fromDate":"2027-01-01","toDate":"2027-01-31"}]}""").andExpect(status().is2xxSuccessful())).get("id").asString();
        String inconnu = read(send("POST", "/api/actors", a, """
            {"firstName":"Inconnu","lastName":"Test","gender":"Homme","city":"Paris"}""").andExpect(status().is2xxSuccessful())).get("id").asString();

        send("POST", "/api/roles/" + r + "/shortlist", a, Map.of("actorId", libre)).andExpect(jsonPath("$.availability").value("OK"));
        send("POST", "/api/roles/" + r + "/shortlist", a, Map.of("actorId", occupe))
                .andExpect(jsonPath("$.availability").value("A_VERIFIER"))
                .andExpect(jsonPath("$.availabilityNote").value("Disponible seulement du 01/01/2027 au 31/01/2027"));
        send("POST", "/api/roles/" + r + "/shortlist", a, Map.of("actorId", inconnu)).andExpect(jsonPath("$.availability").isEmpty());
    }
}
