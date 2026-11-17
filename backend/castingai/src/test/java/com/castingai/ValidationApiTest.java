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

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Règles de saisie appliquées par le serveur (miroir des contrôles de l'interface). */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ValidationApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private String admin() throws Exception {
        String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("email", "ahmed@casting.com", "password", "password123"))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return "Bearer " + json.readTree(body).get("accessToken").asString();
    }

    private ResultActions send(String method, String url, String a, Object body) throws Exception {
        var req = switch (method) { case "POST" -> post(url); case "PUT" -> put(url); case "PATCH" -> patch(url); default -> get(url); };
        req.header("Authorization", a);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body instanceof String s ? s : json.writeValueAsString(body));
        return mvc.perform(req);
    }

    private JsonNode read(ResultActions r) throws Exception { return json.readTree(r.andReturn().getResponse().getContentAsString()); }

    private ResultActions actor(String a, String extra) throws Exception {
        return send("POST", "/api/actors", a, "{\"firstName\":\"Règle\",\"lastName\":\"Test\"" + extra + "}");
    }

    @Test
    void acteurRefuseLesValeursImpossibles() throws Exception {
        String a = admin();
        actor(a, ",\"birthDate\":\"2099-01-01\"").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("La date de naissance doit être dans le passé"));
        actor(a, ",\"birthDate\":\"1850-01-01\"").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message", containsString("trop ancienne")));
        actor(a, ",\"height\":400").andExpect(status().isBadRequest()).andExpect(jsonPath("$.message", containsString("Taille")));
        actor(a, ",\"weight\":1").andExpect(status().isBadRequest()).andExpect(jsonPath("$.message", containsString("Poids")));
        actor(a, ",\"email\":\"lea@agence\"").andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Adresse e-mail invalide"));
        actor(a, ",\"phone\":\"appelez-moi\"").andExpect(status().isBadRequest()).andExpect(jsonPath("$.message", containsString("Téléphone")));
        send("POST", "/api/actors", a, "{\"firstName\":\"   \",\"lastName\":\"Test\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Le prénom est obligatoire"));
        actor(a, ",\"birthDate\":\"1990-05-01\",\"experiences\":[{\"title\":\"Rôle\",\"year\":1985}]")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message", containsString("avant la naissance")));
        // Valeurs correctes, champs facultatifs vides : accepté.
        actor(a, ",\"birthDate\":\"1990-05-01\",\"height\":175,\"email\":\"lea@agence.fr\",\"phone\":\"+33 6 12 34 56 78\"")
                .andExpect(status().is2xxSuccessful());
        actor(a, ",\"email\":\"\",\"phone\":\"\"").andExpect(status().is2xxSuccessful());
    }

    @Test
    void disponibilitesOrdonneesEtSansChevauchement() throws Exception {
        String a = admin();
        actor(a, ",\"availabilities\":[{\"fromDate\":\"2027-03-10\",\"toDate\":\"2027-03-01\"}]")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message", containsString("ne peut pas précéder son début")));
        actor(a, ",\"availabilities\":[{\"fromDate\":\"2027-03-01\",\"toDate\":\"2027-03-20\"},{\"fromDate\":\"2027-03-15\",\"toDate\":\"2027-04-01\"}]")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("Deux périodes de disponibilité se chevauchent"));
        actor(a, ",\"availabilities\":[{\"fromDate\":\"2027-03-01\",\"toDate\":\"2027-03-20\"},{\"fromDate\":\"2027-03-21\",\"toDate\":\"2027-04-01\"}]")
                .andExpect(status().is2xxSuccessful());
    }

    @Test
    void tournageDansLaPeriodeDuProjet() throws Exception {
        String a = admin();
        String p = read(send("POST", "/api/projects", a, Map.of("title", "Projet borné", "type", "SERIE",
                "startDate", "2027-01-01", "endDate", "2027-06-30")).andExpect(status().isCreated())).get("id").asString();
        send("POST", "/api/projects/" + p + "/roles", a, Map.of("name", "Trop tôt", "shootStart", "2026-12-15", "shootEnd", "2027-01-10"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message", containsString("avant le projet (01/01/2027)")));
        send("POST", "/api/projects/" + p + "/roles", a, Map.of("name", "Trop tard", "shootStart", "2027-06-01", "shootEnd", "2027-07-15"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message", containsString("après le projet (30/06/2027)")));
        send("POST", "/api/projects/" + p + "/roles", a, Map.of("name", "Dans les temps", "shootStart", "2027-02-01", "shootEnd", "2027-02-20"))
                .andExpect(status().isCreated());
    }

    @Test
    void dateAuditionPeutEtreEffacee() throws Exception {
        String a = admin();
        String p = read(send("POST", "/api/projects", a, Map.of("title", "Projet audition", "type", "SERIE"))).get("id").asString();
        String r = read(send("POST", "/api/projects/" + p + "/roles", a, Map.of("name", "Nina"))).get("id").asString();
        String act = read(actor(a, "").andExpect(status().is2xxSuccessful())).get("id").asString();
        String e = read(send("POST", "/api/roles/" + r + "/shortlist", a, Map.of("actorId", act))).get("id").asString();
        send("PATCH", "/api/shortlist/" + e, a, "{\"auditionDate\":\"2027-02-03\"}").andExpect(jsonPath("$.auditionDate").value("2027-02-03"));
        send("PATCH", "/api/shortlist/" + e, a, "{\"note\":\"rappel\"}").andExpect(jsonPath("$.auditionDate").value("2027-02-03"));
        send("PATCH", "/api/shortlist/" + e, a, "{\"clearAudition\":true}").andExpect(jsonPath("$.auditionDate").isEmpty());
    }
}
