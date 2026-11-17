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

/** Rôles et shortlists (MVP, sprints S4 et S5) sur une vraie base PostgreSQL jetable. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class CastingApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private String auth() throws Exception {
        String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"ahmed@casting.com\",\"password\":\"password123\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return "Bearer " + json.readTree(body).get("accessToken").asString();
    }

    private ResultActions send(String method, String url, String a, Object body) throws Exception {
        var req = switch (method) {
            case "POST" -> post(url); case "PUT" -> put(url); case "PATCH" -> patch(url); default -> get(url);
        };
        req.header("Authorization", a);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body instanceof String s ? s : json.writeValueAsString(body));
        return mvc.perform(req);
    }

    private JsonNode read(ResultActions r) throws Exception {
        return json.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private String project(String a) throws Exception {
        return read(send("POST", "/api/projects", a, "{\"title\":\"Les Passagers\",\"type\":\"LONG_METRAGE\"}")
                .andExpect(status().isCreated())).get("id").asString();
    }

    private String role(String a, String projectId, String body) throws Exception {
        return read(send("POST", "/api/projects/" + projectId + "/roles", a, body).andExpect(status().isCreated())).get("id").asString();
    }

    private String[] actors(String a, int n) throws Exception {
        JsonNode content = read(send("GET", "/api/actors/search?size=" + n, a, null)).get("content");
        String[] ids = new String[n];
        for (int i = 0; i < n; i++) ids[i] = content.get(i).get("id").asString();
        return ids;
    }

    @Test
    void creerUnRoleDonneUnePhraseDeRecherchePreRemplie() throws Exception {
        String a = auth(), p = project(a);
        JsonNode r = read(send("POST", "/api/projects/" + p + "/roles", a, """
            {"name":"Léa","gender":"Femme","minAge":25,"maxAge":35,"languages":["Anglais","Espagnol"],
             "skills":["Danse"],"city":"Paris","importance":"PRINCIPAL"}""").andExpect(status().isCreated()));
        assertThat(r.get("searchPrompt").asString())
                .isEqualTo("femme entre 25 et 35 ans parlant anglais et espagnol avec danse à Paris");
        assertThat(r.get("languages").size()).isEqualTo(2);
        assertThat(r.get("filled").asBoolean()).isFalse();

        send("GET", "/api/projects/" + p, a, null).andExpect(jsonPath("$.rolesCount").value(1));
    }

    @Test
    void reglesDeValidationDuRole() throws Exception {
        String a = auth(), p = project(a);
        send("POST", "/api/projects/" + p + "/roles", a, "{\"name\":\"X\",\"minAge\":40,\"maxAge\":30}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("L'âge minimum ne peut pas dépasser l'âge maximum"));
        send("POST", "/api/projects/" + p + "/roles", a, "{\"name\":\"\"}").andExpect(status().isBadRequest());
        send("POST", "/api/projects/" + p + "/roles", a, "{\"name\":\"X\",\"gender\":\"Autre\"}").andExpect(status().isBadRequest());
    }

    @Test
    void reordonnerLesRoles() throws Exception {
        String a = auth(), p = project(a);
        String r1 = role(a, p, "{\"name\":\"Premier\"}"), r2 = role(a, p, "{\"name\":\"Second\"}");
        send("PUT", "/api/projects/" + p + "/roles/order", a, new String[]{r2, r1})
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Second"))
                .andExpect(jsonPath("$[1].name").value("Premier"));
        send("PUT", "/api/projects/" + p + "/roles/order", a, new String[]{r1}).andExpect(status().isBadRequest());
    }

    @Test
    void shortlistStatutsEtUnSeulChoisi() throws Exception {
        String a = auth(), p = project(a), r = role(a, p, "{\"name\":\"Léa\"}");
        String[] act = actors(a, 2);

        String e1 = read(send("POST", "/api/roles/" + r + "/shortlist", a, Map.of("actorId", act[0]))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PRESELECTIONNE"))).get("id").asString();
        send("POST", "/api/roles/" + r + "/shortlist", a, Map.of("actorId", act[0])).andExpect(status().isConflict());
        String e2 = read(send("POST", "/api/roles/" + r + "/shortlist", a, Map.of("actorId", act[1]))).get("id").asString();

        send("PATCH", "/api/shortlist/" + e1, a, "{\"status\":\"AUDITION\",\"note\":\"Très juste\",\"auditionDate\":\"2027-02-10\"}")
                .andExpect(jsonPath("$.status").value("AUDITION")).andExpect(jsonPath("$.note").value("Très juste"));
        send("PATCH", "/api/shortlist/" + e1, a, "{\"status\":\"CHOISI\"}").andExpect(status().isOk());
        send("GET", "/api/roles/" + r, a, null).andExpect(jsonPath("$.filled").value(true));

        // un second « choisi » demande confirmation, puis remplace le premier (qui repasse en rappel)
        send("PATCH", "/api/shortlist/" + e2, a, "{\"status\":\"CHOISI\"}").andExpect(status().isConflict());
        send("PATCH", "/api/shortlist/" + e2, a, "{\"status\":\"CHOISI\",\"replaceChosen\":true}").andExpect(status().isOk());
        JsonNode list = read(send("GET", "/api/roles/" + r + "/shortlist", a, null));
        for (JsonNode e : list) {
            if (e.get("id").asString().equals(e1)) assertThat(e.get("status").asString()).isEqualTo("RAPPEL");
            if (e.get("id").asString().equals(e2)) assertThat(e.get("status").asString()).isEqualTo("CHOISI");
        }
        send("GET", "/api/roles/" + r, a, null)
                .andExpect(jsonPath("$.countByStatus.CHOISI").value(1)).andExpect(jsonPath("$.countByStatus.RAPPEL").value(1));

        // retirer le choisi : le rôle n'est plus pourvu
        mvc.perform(delete("/api/shortlist/" + e2).header("Authorization", a)).andExpect(status().isNoContent());
        send("GET", "/api/roles/" + r, a, null).andExpect(jsonPath("$.filled").value(false));
    }

    @Test
    void glisserADroiteDepuisUnRoleRemplitLaShortlist() throws Exception {
        String a = auth(), p = project(a), r = role(a, p, "{\"name\":\"Léa\"}");
        String actor = actors(a, 1)[0];
        send("POST", "/api/ai/feedback", a, Map.of("query", "femme", "actorId", actor, "decision", "RETENU", "roleId", r))
                .andExpect(status().isNoContent());
        send("POST", "/api/ai/feedback", a, Map.of("query", "femme", "actorId", actor, "decision", "RETENU", "roleId", r))
                .andExpect(status().isNoContent());                       // pas de doublon ni d'erreur
        assertThat(read(send("GET", "/api/roles/" + r + "/shortlist", a, null)).size()).isEqualTo(1);

        send("POST", "/api/ai/feedback", a, Map.of("query", "femme", "actorId", actor, "decision", "ANNULE", "roleId", r))
                .andExpect(status().isNoContent());
        assertThat(read(send("GET", "/api/roles/" + r + "/shortlist", a, null)).size()).isZero();
    }

    @Test
    void supprimerUnRoleEtRoleInconnu() throws Exception {
        String a = auth(), p = project(a), r = role(a, p, "{\"name\":\"Temporaire\"}");
        mvc.perform(delete("/api/roles/" + r).header("Authorization", a)).andExpect(status().isNoContent());
        send("GET", "/api/roles/" + r, a, null).andExpect(status().isNotFound());
        send("GET", "/api/roles/" + java.util.UUID.randomUUID() + "/shortlist", a, null).andExpect(status().isNotFound());
    }

    @Test
    void partageAuRealisateurEtAvis() throws Exception {
        String a = auth(), p = project(a), r = role(a, p, "{\"name\":\"Léa\"}");
        String[] act = actors(a, 2);
        String e1 = read(send("POST", "/api/roles/" + r + "/shortlist", a, Map.of("actorId", act[0]))).get("id").asString();
        send("POST", "/api/roles/" + r + "/shortlist", a, Map.of("actorId", act[1])).andExpect(status().isCreated());

        JsonNode share = read(send("POST", "/api/roles/" + r + "/shares", a, "{\"label\":\"Pour Claire\",\"days\":7}")
                .andExpect(status().isCreated()));
        String token = share.get("token").asString();
        assertThat(token).hasSize(32);
        send("POST", "/api/roles/" + r + "/shares", a, "{\"days\":120}").andExpect(status().isBadRequest());

        // le réalisateur, sans compte : candidats sans coordonnées
        String page = mvc.perform(get("/api/public/shares/" + token)).andExpect(status().isOk())
                .andExpect(jsonPath("$.roleName").value("Léa"))
                .andExpect(jsonPath("$.candidates.length()").value(2))
                .andReturn().getResponse().getContentAsString();
        assertThat(page).doesNotContain("\"email\"").doesNotContain("\"phone\"");

        mvc.perform(put("/api/public/shares/" + token + "/votes/" + e1).contentType(MediaType.APPLICATION_JSON)
                .content("{\"vote\":\"OUI\",\"comment\":\"Très juste\",\"voterName\":\"Claire\"}"))
                .andExpect(status().isNoContent());
        mvc.perform(put("/api/public/shares/" + token + "/votes/" + e1).contentType(MediaType.APPLICATION_JSON)
                .content("{\"vote\":\"PEUT\",\"voterName\":\"Claire\"}")).andExpect(status().isBadRequest());
        mvc.perform(put("/api/public/shares/" + token + "/votes/" + java.util.UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"vote\":\"NON\",\"voterName\":\"Claire\"}")).andExpect(status().isNotFound());

        // l'agent voit l'avis
        send("GET", "/api/roles/" + r + "/votes", a, null)
                .andExpect(jsonPath("$[0].vote").value("OUI")).andExpect(jsonPath("$[0].voterName").value("Claire"));
        send("GET", "/api/roles/" + r + "/shares", a, null).andExpect(jsonPath("$[0].oui").value(1));

        // lien révoqué : plus accessible ; jeton inconnu : introuvable
        mvc.perform(delete("/api/shares/" + share.get("id").asString()).header("Authorization", a)).andExpect(status().isNoContent());
        mvc.perform(get("/api/public/shares/" + token)).andExpect(status().isGone());
        mvc.perform(get("/api/public/shares/inconnu")).andExpect(status().isNotFound());
        // l'espace agence reste fermé sans connexion
        mvc.perform(get("/api/roles/" + r + "/shares")).andExpect(status().isUnauthorized());
    }
}
