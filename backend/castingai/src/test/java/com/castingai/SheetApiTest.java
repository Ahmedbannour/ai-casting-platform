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

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** P-083 · Fiche unique du projet : chaque rôle modifie son étape ; un brief déposé remplit la fiche et propose aux autres. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@org.springframework.test.context.TestPropertySource(properties = "spring.ai.ollama.base-url=http://127.0.0.1:9")   // IA absente : règles seules, test rapide
class SheetApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private String login(String email, String pw) throws Exception {
        String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + email + "\",\"password\":\"" + pw + "\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return "Bearer " + json.readTree(body).get("accessToken").asString();
    }

    private ResultActions send(String method, String url, String a, Object body) throws Exception {
        var req = switch (method) { case "POST" -> post(url); case "PUT" -> put(url); case "DELETE" -> delete(url); default -> get(url); };
        if (a != null) req.header("Authorization", a);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body instanceof String s ? s : json.writeValueAsString(body));
        return mvc.perform(req);
    }

    private JsonNode read(ResultActions r) throws Exception { return json.readTree(r.andReturn().getResponse().getContentAsString()); }

    private String org(String admin, String name, String kind) throws Exception {
        return read(send("POST", "/api/admin/agencies", admin, "{\"name\":\"" + name + "\",\"contractStart\":\"" + LocalDate.now() + "\",\"kind\":\"" + kind + "\"}")
                .andExpect(status().is2xxSuccessful())).get("id").asString();
    }

    private String account(String admin, String email, String role, String orgId) throws Exception {
        send("POST", "/api/admin/agents", admin, "{\"email\":\"" + email + "\",\"firstName\":\"Test\",\"lastName\":\"" + role + "\",\"role\":\"" + role
                + "\",\"agencyId\":\"" + orgId + "\",\"password\":\"Motdepasse-123\"}").andExpect(status().isCreated());
        return login(email, "Motdepasse-123");
    }

    @Test
    void chaqueRoleRemplitSonEtapeEtUnBriefDeposePreRemplitLaFiche() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String prod = account(admin, "fiche.prod@exemple.tn", "BOITE_PROD", org(admin, "Prod Fiche", "BOITE_PROD"));
        String brand = account(admin, "fiche.marque@exemple.tn", "MARQUE", org(admin, "Marque Fiche", "MARQUE"));
        String agency = account(admin, "fiche.agence@exemple.tn", "AGENCE_MARKETING", org(admin, "Agence Fiche", "AGENCE_MARKETING"));
        String outsider = account(admin, "fiche.autre@exemple.tn", "MARQUE", org(admin, "Marque Autre", "MARQUE"));
        String id = read(send("POST", "/api/demandes", prod, "{\"title\":\"Spot Zitouna\"}").andExpect(status().isCreated())).get("id").asString();
        send("POST", "/api/demandes/" + id + "/invitations", prod, "{\"email\":\"fiche.marque@exemple.tn\",\"kind\":\"MARQUE\"}").andExpect(status().isOk());
        send("POST", "/api/demandes/" + id + "/invitations", prod, "{\"email\":\"fiche.agence@exemple.tn\",\"kind\":\"AGENCE_MARKETING\"}").andExpect(status().isOk());

        // Même fiche pour tous, droits différents : la marque modifie le brief, pas le concept
        JsonNode f = read(send("GET", "/api/demandes/" + id + "/fiche", brand, null).andExpect(status().isOk()));
        assertThat(f.get("stages").size()).isEqualTo(7);
        assertThat(stage(f, "brief").get("canEdit").asBoolean()).isTrue();
        assertThat(stage(f, "concept").get("canEdit").asBoolean()).isFalse();
        assertThat(stage(f, "identite").get("fields").get(0).get("value").asString()).isEqualTo("Spot Zitouna");   // une seule source : la demande
        send("PUT", "/api/demandes/" + id + "/fiche/champs/objectif", brand, "{\"value\":\"Faire aimer la bouteille\"}").andExpect(status().isOk());
        send("PUT", "/api/demandes/" + id + "/fiche/champs/idee", brand, "{\"value\":\"Une idee\"}").andExpect(status().isForbidden());
        send("PUT", "/api/demandes/" + id + "/fiche/champs/idee", agency, "{\"value\":\"La famille sous l'olivier\"}").andExpect(status().isOk());
        send("GET", "/api/demandes/" + id + "/fiche", outsider, null).andExpect(status().isNotFound());
        assertThat(read(send("GET", "/api/demandes/" + id, brand, null)).get("objective").asString()).isEqualTo("Faire aimer la bouteille");

        // La marque dépose son brief : son étape se remplit, le reste devient des propositions
        var file = new org.springframework.mock.web.MockMultipartFile("file", "brief.txt", "text/plain", com.castingai.sheet.SheetReadingTest.BRIEF.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        mvc.perform(multipart("/api/demandes/" + id + "/fiche/sources").file(file).header("Authorization", brand)).andExpect(status().isOk());
        JsonNode done = null;
        for (int i = 0; i < 60; i++) {
            done = read(send("GET", "/api/demandes/" + id + "/fiche", brand, null));
            if (!done.get("sources").get(0).get("status").asString().equals("LECTURE")) break;
            Thread.sleep(250);
        }
        JsonNode src = done.get("sources").get(0);
        assertThat(src.get("status").asString()).isEqualTo("FAIT");
        assertThat(src.get("filled").asInt()).isGreaterThanOrEqualTo(3);   // cible, message, ton, contraintes
        assertThat(field(stage(done, "brief"), "cible").get("value").asString()).startsWith("Familles tunisiennes");
        assertThat(field(stage(done, "brief"), "cible").get("source").asString()).isEqualTo("IA");
        // L'objectif déjà écrit n'est pas écrasé : proposition
        assertThat(field(stage(done, "brief"), "objectif").get("value").asString()).isEqualTo("Faire aimer la bouteille");
        assertThat(field(stage(done, "brief"), "objectif").get("suggestion").asString()).startsWith("faire connaître");
        // Le producer reçoit les champs de son étape en propositions, et une notification
        JsonNode p = read(send("GET", "/api/demandes/" + id + "/fiche", prod, null));
        assertThat(field(stage(p, "identite"), "supports").get("suggestion").asString()).contains("Instagram");
        assertThat(read(send("GET", "/api/me/notifications", prod, null)).get("items").toString()).contains("pré-rempli");
        send("POST", "/api/demandes/" + id + "/fiche/champs/supports/accepter", brand, null).andExpect(status().isForbidden());
        JsonNode acc = read(send("POST", "/api/demandes/" + id + "/fiche/champs/supports/accepter", prod, null).andExpect(status().isOk()));
        assertThat(field(stage(acc, "identite"), "supports").get("value").asString()).contains("Instagram");
        JsonNode dec = read(send("POST", "/api/demandes/" + id + "/fiche/champs/diffusion/ecarter", prod, null).andExpect(status().isOk()));
        assertThat(field(stage(dec, "identite"), "diffusion").get("suggestion").isNull()).isTrue();

        // Un lien interne est refusé tout de suite
        send("POST", "/api/demandes/" + id + "/fiche/liens", brand, "{\"url\":\"https://127.0.0.1/brief\"}").andExpect(status().isBadRequest());
    }

    private static JsonNode stage(JsonNode sheet, String key) {
        for (JsonNode s : sheet.get("stages")) if (s.get("key").asString().equals(key)) return s;
        throw new AssertionError("étape " + key);
    }

    private static JsonNode field(JsonNode stage, String key) {
        for (JsonNode f : stage.get("fields")) if (f.get("key").asString().equals(key)) return f;
        throw new AssertionError("champ " + key);
    }
}
