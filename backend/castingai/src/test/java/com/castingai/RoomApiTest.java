package com.castingai;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import java.time.LocalDate;
import java.util.Map;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Room de casting : la production dirige, la marque, l'agence et le réalisateur swipent ; match, classement, documents par rôle, tâches. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class RoomApiTest {

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
                + "\"" + (orgId == null ? "" : ",\"agencyId\":\"" + orgId + "\"") + ",\"password\":\"Motdepasse-123\"}").andExpect(status().isCreated());
        return login(email, "Motdepasse-123");
    }

    private String userId(String admin, String email) throws Exception {
        JsonNode list = read(send("GET", "/api/admin/users", admin, null));
        JsonNode arr = list.isArray() ? list : list.get("content");
        for (JsonNode u : arr) if (email.equals(u.get("email").asString())) return u.get("id").asString();
        throw new IllegalStateException("utilisateur introuvable : " + email);
    }

    private ResultActions upload(String url, String a, String name, String... audience) throws Exception {
        var req = multipart(url).file(new MockMultipartFile("file", name, "application/pdf", "%PDF-1.4 room".getBytes()));
        for (String x : audience) req.param("audience", x);
        req.header("Authorization", a);
        return mvc.perform(req);
    }

    @Test
    void laRoomReunitLEquipeEtClasseLesCandidats() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String brandOrg = org(admin, "Room Marque", "MARQUE"), agOrg = org(admin, "Room Agence", "AGENCE_MARKETING"), prodOrg = org(admin, "Room Prod", "BOITE_PROD");
        String brand = account(admin, "room.marque@exemple.tn", "MARQUE", brandOrg);
        String agency = account(admin, "room.agence@exemple.tn", "AGENCE_MARKETING", agOrg);
        String prod = account(admin, "room.prod@exemple.tn", "BOITE_PROD", prodOrg);
        String director = account(admin, "room.real@exemple.tn", "REALISATEUR", null);
        String outsider = account(admin, "room.autre@exemple.tn", "MARQUE", org(admin, "Room Autre", "MARQUE"));

        // Cycle publicitaire jusqu'à la V2 publiée : le projet et sa room naissent
        // Le producer crée le projet et invite la marque et l'agence (comptes déjà inscrits : rattachés tout de suite)
        String id = read(send("POST", "/api/demandes", prod, "{\"title\":\"Room Eau\"}").andExpect(status().isCreated())).get("id").asString();
        send("POST", "/api/demandes/" + id + "/invitations", prod, "{\"email\":\"room.marque@exemple.tn\",\"kind\":\"MARQUE\"}").andExpect(status().isOk());
        send("POST", "/api/demandes/" + id + "/invitations", prod, "{\"email\":\"room.agence@exemple.tn\",\"kind\":\"AGENCE_MARKETING\"}").andExpect(status().isOk());
        send("PUT", "/api/demandes/" + id + "/v0", brand, "{\"body\":\"Une source en montagne.\"}").andExpect(status().isOk());
        send("POST", "/api/demandes/" + id + "/envoyer", brand, "{}").andExpect(status().isOk());
        send("POST", "/api/demandes/" + id + "/accepter", agency, null);
        send("PUT", "/api/demandes/" + id + "/v1", agency, "{\"body\":\"Concept : la source.\"}");
        send("POST", "/api/demandes/" + id + "/v1/livrer", agency, null);
        send("POST", "/api/demandes/" + id + "/v1/valider", brand, null);
        send("POST", "/api/demandes/" + id + "/personnages", prod, "{\"name\":\"La randonneuse\"}");
        send("POST", "/api/demandes/" + id + "/transmettre", prod, "{\"directorId\":\"" + userId(admin, "room.real@exemple.tn") + "\"}").andExpect(status().isOk());
        send("PUT", "/api/demandes/" + id + "/v2", director, "{\"body\":\"V2 : un plan-séquence.\"}");
        send("POST", "/api/demandes/" + id + "/roles", director, "{\"name\":\"La randonneuse\",\"intention\":\"Une femme libre qui boit à la source.\",\"importance\":\"PRINCIPAL\"}");
        String pid = read(send("POST", "/api/demandes/" + id + "/v2/publier", director, null).andExpect(status().isOk())).get("projectId").asString();
        // La marque et l'agence voient le lien vers la room
        assertThat(read(send("GET", "/api/demandes/" + id, brand, null)).get("projectId").asString()).isEqualTo(pid);

        // Chef de room : la production ; la marque peut swiper mais pas diriger ; un étranger ne voit rien
        JsonNode rp = read(send("GET", "/api/rooms/" + pid, prod, null).andExpect(status().isOk()));
        assertThat(rp.get("me").get("lead").asBoolean()).isTrue();
        JsonNode rb = read(send("GET", "/api/rooms/" + pid, brand, null).andExpect(status().isOk()));
        assertThat(rb.get("me").get("lead").asBoolean()).isFalse();
        assertThat(rb.get("me").get("swipe").asBoolean()).isTrue();
        assertThat(rb.get("me").get("docs").asBoolean()).isFalse();
        send("GET", "/api/rooms/" + pid, outsider, null).andExpect(status().isNotFound());
        assertThat(read(send("GET", "/api/rooms", brand, null)).toString()).contains("Room Eau");

        // Shortlist du rôle : deux candidats
        String roleId = rp.get("roles").get(0).get("id").asString();
        JsonNode found = read(send("GET", "/api/actors/search?size=2", admin, null)).get("content");
        String e1 = read(send("POST", "/api/roles/" + roleId + "/shortlist", prod, Map.of("actorId", found.get(0).get("id").asString())).andExpect(status().isCreated())).get("id").asString();
        String e2 = read(send("POST", "/api/roles/" + roleId + "/shortlist", prod, Map.of("actorId", found.get(1).get("id").asString())).andExpect(status().isCreated())).get("id").asString();

        // Swipe : chacun voit les deux cartes ; vote inconnu refusé
        assertThat(read(send("GET", "/api/rooms/" + pid + "/roles/" + roleId + "/swipe", brand, null)).size()).isEqualTo(2);
        send("PUT", "/api/rooms/" + pid + "/votes/" + e1, brand, "{\"vote\":\"PEUT-ETRE\"}").andExpect(status().isBadRequest());
        JsonNode v1 = read(send("PUT", "/api/rooms/" + pid + "/votes/" + e1, brand, "{\"vote\":\"OUI\"}").andExpect(status().isOk()));
        assertThat(v1.get("match").asBoolean()).isFalse();
        assertThat(v1.get("left").asInt()).isEqualTo(1);
        send("PUT", "/api/rooms/" + pid + "/votes/" + e1, agency, "{\"vote\":\"OUI\"}").andExpect(status().isOk());
        JsonNode v3 = read(send("PUT", "/api/rooms/" + pid + "/votes/" + e1, director, "{\"vote\":\"COEUR\"}").andExpect(status().isOk()));
        assertThat(v3.get("match").asBoolean()).isTrue();
        assertThat(v3.get("newMatch").asBoolean()).isTrue();
        assertThat(read(send("GET", "/api/me/notifications", prod, null)).get("items").toString()).contains("Match");
        send("PUT", "/api/rooms/" + pid + "/votes/" + e2, brand, "{\"vote\":\"NON\"}").andExpect(status().isOk());
        send("PUT", "/api/rooms/" + pid + "/votes/" + e2, agency, "{\"vote\":\"OUI\"}").andExpect(status().isOk());
        assertThat(read(send("GET", "/api/rooms/" + pid + "/roles/" + roleId + "/swipe", brand, null)).size()).isEqualTo(0);

        // Résultats : le match avec coup de cœur passe devant ; un Non casse le match
        JsonNode res = read(send("GET", "/api/rooms/" + pid + "/roles/" + roleId + "/resultats", agency, null).andExpect(status().isOk()));
        assertThat(res.get(0).get("entryId").asString()).isEqualTo(e1);
        assertThat(res.get(0).get("match").asBoolean()).isTrue();
        assertThat(res.get(0).get("coeurs").asInt()).isEqualTo(1);
        assertThat(res.get(1).get("match").asBoolean()).isFalse();
        // Choix : réservé au chef de room ; le 2e candidat devient 1er choix et passe devant
        send("PUT", "/api/rooms/" + pid + "/choix/" + e2, brand, "{\"rank\":1}").andExpect(status().isForbidden());
        JsonNode ranked = read(send("PUT", "/api/rooms/" + pid + "/choix/" + e2, prod, "{\"rank\":1}").andExpect(status().isOk()));
        assertThat(ranked.get(0).get("entryId").asString()).isEqualTo(e2);
        ranked = read(send("PUT", "/api/rooms/" + pid + "/choix/" + e1, prod, "{\"rank\":1}").andExpect(status().isOk()));
        assertThat(ranked.get(0).get("entryId").asString()).isEqualTo(e1);
        assertThat(ranked.get(1).get("rank").isNull()).isTrue();   // un seul 1er choix par rôle

        // Documents par rôle : réservé au réalisateur → la marque ne le voit pas ; la marque ne dépose rien sans autorisation
        JsonNode docs = read(upload("/api/rooms/" + pid + "/documents", prod, "plan-de-travail.pdf", "REALISATEUR").andExpect(status().isOk()));
        String docId = docs.get(0).get("id").asString();
        assertThat(read(send("GET", "/api/rooms/" + pid + "/documents", director, null)).size()).isEqualTo(1);
        assertThat(read(send("GET", "/api/rooms/" + pid + "/documents", brand, null)).size()).isEqualTo(0);
        send("GET", "/api/rooms/" + pid + "/documents/" + docId + "/fichier", brand, null).andExpect(status().isNotFound());
        upload("/api/rooms/" + pid + "/documents", brand, "idee.pdf").andExpect(status().isForbidden());
        // Nouvelle version, puis ouverture à la marque
        JsonNode v2 = read(upload("/api/rooms/" + pid + "/documents/" + docId + "/version", prod, "plan-de-travail-v2.pdf").andExpect(status().isOk()));
        assertThat(v2.get(0).get("version").asInt()).isEqualTo(2);
        send("PUT", "/api/rooms/" + pid + "/documents/" + docId + "/audience", prod, "{\"audience\":[]}").andExpect(status().isBadRequest());
        send("PUT", "/api/rooms/" + pid + "/documents/" + docId + "/audience", prod, "{\"audience\":[\"REALISATEUR\",\"MARQUE\"]}").andExpect(status().isOk());
        send("GET", "/api/rooms/" + pid + "/documents/" + docId + "/fichier", brand, null).andExpect(status().isOk());

        // Autorisations : la production ouvre les documents à la marque
        String brandId = userId(admin, "room.marque@exemple.tn");
        send("PUT", "/api/rooms/" + pid + "/membres/" + brandId, brand, "{\"docs\":true}").andExpect(status().isForbidden());
        send("PUT", "/api/rooms/" + pid + "/membres/" + brandId, prod, "{\"docs\":true}").andExpect(status().isOk());
        upload("/api/rooms/" + pid + "/documents", brand, "idee.pdf").andExpect(status().isOk());

        // Tâches : la production confie, le réalisateur déplace la sienne, la marque ne gère pas
        String dirId = userId(admin, "room.real@exemple.tn");
        send("POST", "/api/rooms/" + pid + "/taches", brand, "{\"title\":\"X\"}").andExpect(status().isForbidden());
        send("POST", "/api/rooms/" + pid + "/taches", prod, "{\"title\":\"\"}").andExpect(status().isBadRequest());
        JsonNode ts = read(send("POST", "/api/rooms/" + pid + "/taches", prod,
                "{\"title\":\"Valider les essais costumes\",\"assigneeId\":\"" + dirId + "\",\"dueDate\":\"" + LocalDate.now().plusDays(3) + "\"}").andExpect(status().isOk()));
        String taskId = ts.get(0).get("id").asString();
        assertThat(read(send("GET", "/api/me/notifications", director, null)).get("items").toString()).contains("Valider les essais costumes");
        send("PUT", "/api/rooms/" + pid + "/taches/" + taskId + "/etat", brand, "{\"status\":\"FAIT\"}").andExpect(status().isForbidden());
        JsonNode moved = read(send("PUT", "/api/rooms/" + pid + "/taches/" + taskId + "/etat", director, "{\"status\":\"FAIT\"}").andExpect(status().isOk()));
        assertThat(moved.get(0).get("status").asString()).isEqualTo("FAIT");
        assertThat(read(send("GET", "/api/rooms/" + pid, prod, null)).get("tasksOpen").asInt()).isEqualTo(0);
    }
}
