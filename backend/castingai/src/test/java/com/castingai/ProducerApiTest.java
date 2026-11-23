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

/** Le producer crée le projet, invite la marque et l'agence, et donne ses autorisations à son assistante. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ProducerApiTest {

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
    void laDiscussionPrevientLaPersonneMentionneeEtResteDansLEquipe() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String prodOrg = org(admin, "Prod Discussion", "BOITE_PROD");
        String producer = account(admin, "disc.prod@exemple.tn", "BOITE_PROD", prodOrg);
        String colleague = account(admin, "disc.prod2@exemple.tn", "BOITE_PROD", prodOrg);
        String outsider = account(admin, "disc.marque@exemple.tn", "MARQUE", org(admin, "Marque Ailleurs", "MARQUE"));
        String id = read(send("POST", "/api/demandes", producer, "{\"title\":\"Spot discussion\"}").andExpect(status().isCreated())).get("id").asText();

        JsonNode t = read(send("GET", "/api/demandes/" + id + "/discussion", producer, null).andExpect(status().isOk()));
        String colleagueId = null;
        for (JsonNode p : t.get("people")) if (p.get("name").asText().contains("BOITE_PROD") && !p.get("id").asText().isEmpty()) colleagueId = p.get("id").asText();
        assertThat(t.get("people").size()).isGreaterThanOrEqualTo(2);
        // on retrouve le collègue par son e-mail côté admin : plus simple, on mentionne tout le monde sauf soi
        StringBuilder ids = new StringBuilder();
        for (JsonNode p : t.get("people")) { if (ids.length() > 0) ids.append(','); ids.append('"').append(p.get("id").asText()).append('"'); }
        JsonNode after = read(send("POST", "/api/demandes/" + id + "/discussion", producer,
                "{\"body\":\"Qui valide le lieu ?\",\"mentions\":[" + ids + "]}").andExpect(status().isCreated()));
        assertThat(after.get("comments").size()).isEqualTo(1);
        assertThat(after.get("comments").get(0).get("mine").asBoolean()).isTrue();
        assertThat(read(send("GET", "/api/me/notifications", colleague, null)).get("items").toString()).contains("vous mentionne");
        // Message vide refusé ; une personne hors de l'équipe ne voit pas la discussion
        send("POST", "/api/demandes/" + id + "/discussion", producer, "{\"body\":\"  \"}").andExpect(status().isBadRequest());
        send("GET", "/api/demandes/" + id + "/discussion", outsider, null).andExpect(status().isNotFound());
        assertThat(colleagueId).isNotNull();
    }

    @Test
    void lePoulsSignaleLActiviteDesAutresSeulement() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String prodOrg = org(admin, "Prod Pouls", "BOITE_PROD");
        String producer = account(admin, "pouls.prod@exemple.tn", "BOITE_PROD", prodOrg);
        String other = account(admin, "pouls.prod2@exemple.tn", "BOITE_PROD", prodOrg);
        long seqP = read(send("GET", "/api/me/pulse", producer, null)).get("seq").asLong();
        long seqO = read(send("GET", "/api/me/pulse", other, null)).get("seq").asLong();
        // Une écriture du producer…
        send("POST", "/api/demandes", producer, "{\"title\":\"Spot pouls\"}").andExpect(status().isCreated());
        // …réveille les pages de l'autre, pas les siennes
        JsonNode o = read(send("GET", "/api/me/pulse?since=" + seqO, other, null));
        assertThat(o.get("others").asBoolean()).isTrue();
        assertThat(o.get("seq").asLong()).isGreaterThan(seqO);
        JsonNode m = read(send("GET", "/api/me/pulse?since=" + seqP, producer, null));
        assertThat(m.get("others").asBoolean()).isFalse();
        // Lire ses notifications ne réveille personne
        long now = o.get("seq").asLong();
        send("POST", "/api/me/notifications/read", producer, null);
        assertThat(read(send("GET", "/api/me/pulse?since=" + now, other, null)).get("others").asBoolean()).isFalse();
    }

    @Test
    void leProducerMeneLeProjetEtSonAssistanteFaitCeQuIlAutorise() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String prodOrg = org(admin, "Prod Nu", "BOITE_PROD");
        String producer = account(admin, "producer@nu.tn", "BOITE_PROD", prodOrg);
        String brand = account(admin, "marque@nu.tn", "MARQUE", org(admin, "Marque Nu", "MARQUE"));

        // Seul le producer crée le projet ; la marque ne crée plus de demande
        send("POST", "/api/demandes", brand, "{\"title\":\"X\"}").andExpect(status().isForbidden());
        JsonNode p = read(send("POST", "/api/demandes", producer, "{\"title\":\"Spot Nu\",\"product\":\"Savon\"}").andExpect(status().isCreated()));
        String id = p.get("id").asString();
        assertThat(p.get("productionName").asString()).isEqualTo("Prod Nu");
        assertThat(p.get("brandName").asString()).isEqualTo("Marque à inviter");
        assertThat(p.get("canInvite").asBoolean()).isTrue();
        assertThat(p.get("nowWhat").asString()).contains("invite la marque");

        // Marque déjà inscrite : rattachée tout de suite, notifiée, et c'est elle qui écrit la V0
        JsonNode inv = read(send("POST", "/api/demandes/" + id + "/invitations", producer, "{\"email\":\"marque@nu.tn\",\"kind\":\"MARQUE\"}").andExpect(status().isOk()));
        assertThat(inv.get("status").asString()).isEqualTo("RATTACHE");
        send("POST", "/api/demandes/" + id + "/invitations", producer, "{\"email\":\"marque@nu.tn\",\"kind\":\"MARQUE\"}").andExpect(status().isConflict());
        send("POST", "/api/demandes/" + id + "/invitations", producer, "{\"email\":\"producer@nu.tn\",\"kind\":\"AGENCE_MARKETING\"}").andExpect(status().isBadRequest());
        JsonNode seen = read(send("GET", "/api/demandes/" + id, brand, null).andExpect(status().isOk()));
        assertThat(seen.get("canEdit").asBoolean()).isTrue();
        assertThat(read(send("GET", "/api/me/notifications", brand, null)).get("items").toString()).contains("Spot Nu");
        send("PUT", "/api/demandes/" + id + "/v0", brand, "{\"body\":\"Une salle de bain au matin.\"}").andExpect(status().isOk());
        // Sans agence invitée, la V0 ne part pas
        send("POST", "/api/demandes/" + id + "/envoyer", brand, "{}").andExpect(status().isBadRequest());

        // Agence pas encore inscrite : un lien ; en l'ouvrant elle crée son compte et rejoint le projet
        JsonNode link = read(send("POST", "/api/demandes/" + id + "/invitations", producer, "{\"email\":\"Contact@Agence-Nu.tn\",\"kind\":\"AGENCE_MARKETING\"}").andExpect(status().isOk()));
        assertThat(link.get("status").asString()).isEqualTo("LIEN");
        String token = link.get("token").asString();
        assertThat(read(send("GET", "/api/demandes/" + id + "/invitations", producer, null)).toString()).contains("contact@agence-nu.tn");
        JsonNode preview = read(send("GET", "/api/public/invitations-pro/" + token, null, null).andExpect(status().isOk()));
        assertThat(preview.get("kind").asString()).isEqualTo("AGENCE_MARKETING");
        assertThat(preview.get("requestTitle").asString()).isEqualTo("Spot Nu");
        assertThat(preview.get("needsOrg").asBoolean()).isTrue();
        send("POST", "/api/public/invitations-pro/" + token + "/accept", null,
                "{\"firstName\":\"Lina\",\"lastName\":\"Nu\",\"password\":\"Motdepasse-123\",\"acceptTerms\":true}").andExpect(status().isBadRequest());
        JsonNode acc = read(send("POST", "/api/public/invitations-pro/" + token + "/accept", null,
                "{\"firstName\":\"Lina\",\"lastName\":\"Nu\",\"organisation\":\"Agence Nu\",\"password\":\"Motdepasse-123\",\"acceptTerms\":true}").andExpect(status().isOk()));
        assertThat(acc.get("role").asString()).isEqualTo("AGENCE_MARKETING");
        send("GET", "/api/public/invitations-pro/" + token, null, null).andExpect(status().isNotFound());   // le lien a servi
        String agency = login("contact@agence-nu.tn", "Motdepasse-123");
        JsonNode agSees = read(send("GET", "/api/demandes/" + id, agency, null).andExpect(status().isOk()));
        assertThat(agSees.get("agencyName").asString()).isEqualTo("Agence Nu");
        assertThat(agSees.get("versions").size()).isZero();   // la V0 n'est pas encore envoyée

        // La marque envoie sa V0 : elle part à l'agence invitée
        JsonNode sent = read(send("POST", "/api/demandes/" + id + "/envoyer", brand, "{}").andExpect(status().isOk()));
        assertThat(sent.get("status").asString()).isEqualTo("V0_ENVOYEE");
        assertThat(sent.get("agencyName").asString()).isEqualTo("Agence Nu");
        // L'agence a reçu la V0 : elle ne se remplace plus
        send("POST", "/api/demandes/" + id + "/invitations", producer, "{\"email\":\"autre@agence.tn\",\"kind\":\"AGENCE_MARKETING\"}").andExpect(status().isBadRequest());

        // Assistante : invitée par le producer, avec ses autorisations
        send("POST", "/api/production/assistantes", brand, "{\"email\":\"x@nu.tn\",\"perms\":[]}").andExpect(status().isForbidden());
        send("POST", "/api/production/assistantes", producer, "{\"email\":\"assistante@nu.tn\",\"perms\":[\"VOLER\"]}").andExpect(status().isBadRequest());
        String at = read(send("POST", "/api/production/assistantes", producer, "{\"email\":\"assistante@nu.tn\",\"perms\":[\"INVITATIONS\"]}")
                .andExpect(status().isOk())).get("token").asString();
        JsonNode ap = read(send("GET", "/api/public/invitations-pro/" + at, null, null));
        assertThat(ap.get("joinOrg").asString()).isEqualTo("Prod Nu");
        assertThat(ap.get("perms").toString()).contains("INVITATIONS");
        JsonNode aa = read(send("POST", "/api/public/invitations-pro/" + at + "/accept", null,
                "{\"firstName\":\"Sara\",\"lastName\":\"Assist\",\"password\":\"Motdepasse-123\",\"acceptTerms\":true}").andExpect(status().isOk()));
        assertThat(aa.get("role").asString()).isEqualTo("ASSISTANT_PROD");
        assertThat(aa.get("perms").toString()).contains("INVITATIONS").doesNotContain("PROJETS");
        String assistant = login("assistante@nu.tn", "Motdepasse-123");
        assertThat(read(send("GET", "/api/me/notifications", producer, null)).get("items").toString()).contains("Sara Assist");

        // Elle suit les projets de sa boîte ; sans « projets » elle n'en crée pas, sans « casting » le vivier reste fermé
        assertThat(read(send("GET", "/api/demandes", assistant, null)).toString()).contains("Spot Nu");
        send("POST", "/api/demandes", assistant, "{\"title\":\"Y\"}").andExpect(status().isForbidden());
        send("GET", "/api/projects", assistant, null).andExpect(status().isForbidden());
        send("GET", "/api/production/equipe", assistant, null).andExpect(status().isForbidden());

        // Le producer lui ouvre les projets et le casting
        JsonNode team = read(send("GET", "/api/production/equipe", producer, null).andExpect(status().isOk()));
        String assistantId = team.get("assistants").get(0).get("id").asString();
        assertThat(team.get("allPerms").size()).isEqualTo(5);
        JsonNode upd = read(send("PUT", "/api/production/assistantes/" + assistantId, producer, "{\"perms\":[\"PROJETS\",\"INVITATIONS\",\"CASTING\"]}").andExpect(status().isOk()));
        assertThat(upd.get("perms").toString()).contains("PROJETS").contains("CASTING");
        String id2 = read(send("POST", "/api/demandes", assistant, "{\"title\":\"Spot Nu 2\"}").andExpect(status().isCreated())).get("id").asString();
        assertThat(read(send("POST", "/api/demandes/" + id2 + "/invitations", assistant, "{\"email\":\"marque@nu.tn\",\"kind\":\"MARQUE\"}")
                .andExpect(status().isOk())).get("status").asString()).isEqualTo("RATTACHE");
        send("GET", "/api/projects", assistant, null).andExpect(status().isOk());
        assertThat(read(send("GET", "/api/demandes", producer, null)).toString()).contains("Spot Nu 2");

        // Image de marque : le producer la règle, son équipe la reçoit, la marque ne la change pas
        send("PUT", "/api/production/marque", producer, "{\"name\":\"Studio Nu\",\"color\":\"rouge\"}").andExpect(status().isBadRequest());
        JsonNode brandSet = read(send("PUT", "/api/production/marque", producer, "{\"name\":\"Studio Nu\",\"color\":\"#e4572e\"}").andExpect(status().isOk()));
        assertThat(brandSet.get("color").asString()).isEqualTo("#E4572E");
        send("PUT", "/api/production/marque", assistant, "{\"color\":\"#000000\"}").andExpect(status().isForbidden());
        send("PUT", "/api/production/marque", brand, "{\"color\":\"#000000\"}").andExpect(status().isForbidden());
        assertThat(read(send("GET", "/api/me", assistant, null)).get("brand").get("name").asString()).isEqualTo("Studio Nu");
        assertThat(read(send("GET", "/api/me", brand, null)).get("brand").isNull()).isTrue();

        // Agenda relié à Google ou Outlook : flux iCalendar secret, régénérable
        String feed = read(send("GET", "/api/me/agenda/flux", producer, null).andExpect(status().isOk())).get("token").asString();
        assertThat(feed).matches("[0-9a-f]{48}");
        assertThat(read(send("GET", "/api/me/agenda/flux", producer, null)).get("token").asString()).isEqualTo(feed);
        String cal = mvc.perform(get("/api/public/agenda/" + feed + ".ics")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(cal).startsWith("BEGIN:VCALENDAR").contains("X-WR-CALNAME").endsWith("END:VCALENDAR\r\n");
        String renewed = read(send("POST", "/api/me/agenda/flux", producer, null).andExpect(status().isOk())).get("token").asString();
        assertThat(renewed).isNotEqualTo(feed);
        mvc.perform(get("/api/public/agenda/" + feed + ".ics")).andExpect(status().isNotFound());

        // Désactivée : elle ne se connecte plus
        send("PUT", "/api/production/assistantes/" + assistantId, producer, "{\"enabled\":false}").andExpect(status().isOk());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"assistante@nu.tn\",\"password\":\"Motdepasse-123\"}")).andExpect(status().is4xxClientError());
    }
}
