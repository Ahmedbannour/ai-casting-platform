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

/** Cahier v2, sprint 5 (T-165) : un rôle de figuration ne propose que les acteurs qui acceptent ce type de figuration. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class FigurationSearchTest {

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

    private String actor(String admin, String last, String figuration) throws Exception {
        String id = read(send("POST", "/api/actors", admin, "{\"firstName\":\"Figtest\",\"lastName\":\"" + last + "\"}").andExpect(status().isCreated())).get("id").asString();
        if (figuration != null) send("PUT", "/api/actors/" + id, admin, "{\"figuration\":" + figuration + "}").andExpect(status().isOk());
        return id;
    }

    private java.util.Set<String> ids(String admin, String body) throws Exception {
        java.util.Set<String> out = new java.util.HashSet<>();
        for (int page = 0; page < 20; page++) {
            JsonNode r = read(send("POST", "/api/ai/search", admin, body.replace("PAGE", String.valueOf(page))).andExpect(status().isOk()));
            r.get("results").forEach(a -> out.add(a.get("id").asString()));
            if (!r.get("hasMore").asBoolean()) break;
        }
        return out;
    }

    @Test
    void unRoleDeFigurationNeProposeQueLesActeursQuiLAcceptent() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String silhouette = actor(admin, "Silhouette", "[\"SILHOUETTE\",\"EXTRA\"]");
        String extra = actor(admin, "Extra", "[\"EXTRA\"]");
        String refuse = actor(admin, "Refus", "[]");
        String sansReponse = actor(admin, "SansReponse", null);
        String p = read(send("POST", "/api/projects", admin, "{\"title\":\"Pub figuration\",\"type\":\"PUBLICITE\"}").andExpect(status().isCreated())).get("id").asString();
        String roleSil = read(send("POST", "/api/projects/" + p + "/roles", admin, "{\"name\":\"Passants remarqués\",\"importance\":\"FIGURATION\",\"figurationType\":\"SILHOUETTE\"}").andExpect(status().isCreated())).get("id").asString();
        String roleAny = read(send("POST", "/api/projects/" + p + "/roles", admin, "{\"name\":\"Foule\",\"importance\":\"FIGURATION\"}").andExpect(status().isCreated())).get("id").asString();
        String rolePrincipal = read(send("POST", "/api/projects/" + p + "/roles", admin, "{\"name\":\"Héroïne\",\"importance\":\"PRINCIPAL\",\"figurationType\":\"SILHOUETTE\"}").andExpect(status().isCreated())).get("id").asString();
        send("POST", "/api/projects/" + p + "/roles", admin, "{\"name\":\"X\",\"importance\":\"FIGURATION\",\"figurationType\":\"CASCADEUR\"}").andExpect(status().isBadRequest());
        // Un rôle non figuration ne garde pas de type de figuration
        assertThat(read(send("GET", "/api/roles/" + rolePrincipal, admin, null)).get("figurationType").isNull()).isTrue();

        String q = "{\"query\":\"une personne\",\"page\":PAGE,\"size\":50ROLE}";
        java.util.Set<String> sil = ids(admin, q.replace("ROLE", ",\"roleId\":\"" + roleSil + "\""));
        assertThat(sil).contains(silhouette).doesNotContain(extra, refuse, sansReponse);
        java.util.Set<String> any = ids(admin, q.replace("ROLE", ",\"roleId\":\"" + roleAny + "\""));
        assertThat(any).contains(silhouette, extra).doesNotContain(refuse, sansReponse);
        // Rôle principal ou sans rôle : pas de filtre de figuration
        java.util.Set<String> all = ids(admin, q.replace("ROLE", ",\"roleId\":\"" + rolePrincipal + "\""));
        assertThat(all).contains(silhouette, extra, refuse, sansReponse);
        assertThat(ids(admin, q.replace("ROLE", ""))).contains(refuse, sansReponse);
    }
}
