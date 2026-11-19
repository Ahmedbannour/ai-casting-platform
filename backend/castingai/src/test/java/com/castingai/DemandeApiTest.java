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

/** Cahier v2, sprint 2 (T-158, T-159) : demande de publicité, V0, envoi à l'agence, journal et droits. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class DemandeApiTest {

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
        req.header("Authorization", a);
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
    void laMarqueDeposeSaV0EtLEnvoieALAgence() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String brandOrg = org(admin, "Marque Soleil", "MARQUE"), agencyOrg = org(admin, "Agence Lumière", "AGENCE_MARKETING");
        String otherBrandOrg = org(admin, "Marque Lune", "MARQUE");
        String brand = account(admin, "marque@soleil.tn", "MARQUE", brandOrg);
        String agency = account(admin, "agence@lumiere.tn", "AGENCE_MARKETING", agencyOrg);
        String other = account(admin, "marque@lune.tn", "MARQUE", otherBrandOrg);

        // L'agence ne crée pas de demande
        send("POST", "/api/demandes", agency, "{\"title\":\"X\"}").andExpect(status().isForbidden());

        JsonNode d = read(send("POST", "/api/demandes", brand, "{\"title\":\"Spot été\",\"product\":\"Jus d'orange\",\"objective\":\"Lancer la gamme\",\"keyMessage\":\"Le soleil en bouteille\"}")
                .andExpect(status().isCreated()));
        String id = d.get("id").asString();
        assertThat(d.get("status").asString()).isEqualTo("BROUILLON");
        assertThat(d.get("canEdit").asBoolean()).isTrue();

        // Pas d'envoi sans V0 ; l'agence ne voit pas un brouillon ; une autre marque non plus
        send("POST", "/api/demandes/" + id + "/envoyer", brand, "{\"agencyId\":\"" + agencyOrg + "\"}").andExpect(status().isBadRequest());
        send("GET", "/api/demandes/" + id, agency, null).andExpect(status().isNotFound());
        send("GET", "/api/demandes/" + id, other, null).andExpect(status().isNotFound());

        send("PUT", "/api/demandes/" + id + "/v0", brand, "{\"body\":\"Une famille au petit-déjeuner, la lumière du matin, un verre de jus qui brille.\"}").andExpect(status().isOk());
        // Une organisation qui n'est pas une agence marketing est refusée
        send("POST", "/api/demandes/" + id + "/envoyer", brand, "{\"agencyId\":\"" + otherBrandOrg + "\"}").andExpect(status().isBadRequest());

        JsonNode sent = read(send("POST", "/api/demandes/" + id + "/envoyer", brand, "{\"agencyId\":\"" + agencyOrg + "\"}").andExpect(status().isOk()));
        assertThat(sent.get("status").asString()).isEqualTo("V0_ENVOYEE");
        assertThat(sent.get("agencyName").asString()).isEqualTo("Agence Lumière");
        assertThat(sent.get("versions").get(0).get("status").asString()).isEqualTo("LIVREE");
        assertThat(sent.get("events").get(0).get("type").asString()).isEqualTo("V0_ENVOYEE");

        // V0 figée côté marque
        send("PUT", "/api/demandes/" + id + "/v0", brand, "{\"body\":\"autre\"}").andExpect(status().isBadRequest());

        // L'agence voit la demande, sa V0, et a reçu une notification ; elle ne la modifie pas
        assertThat(read(send("GET", "/api/demandes", agency, null)).size()).isEqualTo(1);
        JsonNode seen = read(send("GET", "/api/demandes/" + id, agency, null).andExpect(status().isOk()));
        assertThat(seen.get("versions").get(0).get("body").asString()).contains("petit-déjeuner");
        assertThat(seen.get("canEdit").asBoolean()).isFalse();
        send("PUT", "/api/demandes/" + id, agency, "{\"title\":\"Pirate\"}").andExpect(status().isForbidden());
        assertThat(read(send("GET", "/api/me/notifications", agency, null)).get("items").toString()).contains("Spot été");

        // Les agences inscrites sont proposées à la marque
        assertThat(read(send("GET", "/api/demandes/agences", brand, null)).toString()).contains("Agence Lumière").doesNotContain("Marque Lune");
        // Un acteur ou un rôle du casting n'accède pas aux demandes (sprint 2)
        assertThat(read(send("GET", "/api/demandes", other, null)).size()).isZero();
    }

    @Test
    void reglesDuBrouillon() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String brand = account(admin, "marque@etoile.tn", "MARQUE", org(admin, "Marque Étoile", "MARQUE"));
        send("POST", "/api/demandes", brand, "{\"title\":\"\"}").andExpect(status().isBadRequest());
        send("POST", "/api/demandes", brand, "{\"title\":\"Spot\",\"airDate\":\"2020-01-01\"}").andExpect(status().isBadRequest());
        String id = read(send("POST", "/api/demandes", brand, "{\"title\":\"Spot hiver\"}").andExpect(status().isCreated())).get("id").asString();
        assertThat(read(send("PUT", "/api/demandes/" + id, brand, "{\"title\":\"Spot hiver chaud\",\"target\":\"Familles\"}")).get("target").asString()).isEqualTo("Familles");
        assertThat(read(send("POST", "/api/demandes/" + id + "/annuler", brand, null)).get("status").asString()).isEqualTo("ANNULEE");
        String id2 = read(send("POST", "/api/demandes", brand, "{\"title\":\"À effacer\"}")).get("id").asString();
        send("DELETE", "/api/demandes/" + id2, brand, null).andExpect(status().isNoContent());
        send("GET", "/api/demandes/" + id2, brand, null).andExpect(status().isNotFound());
    }
}
