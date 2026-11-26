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
    void leDossierSeConstruitAuFilDesRolesJusquALaRoom() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String prod = account(admin, "fiche.prod@exemple.tn", "BOITE_PROD", org(admin, "Prod Fiche", "BOITE_PROD"));
        String brand = account(admin, "fiche.marque@exemple.tn", "MARQUE", org(admin, "Marque Fiche", "MARQUE"));
        String agency = account(admin, "fiche.agence@exemple.tn", "AGENCE_MARKETING", org(admin, "Agence Fiche", "AGENCE_MARKETING"));
        String outsider = account(admin, "fiche.autre@exemple.tn", "MARQUE", org(admin, "Marque Autre", "MARQUE"));
        String id = read(send("POST", "/api/demandes", prod, "{\"title\":\"Spot Zitouna\"}").andExpect(status().isCreated())).get("id").asString();
        String base = "/api/demandes/" + id + "/fiche";

        // Phase brief : la transmission attend l'agence et un brief complet
        JsonNode f = read(send("GET", base, prod, null).andExpect(status().isOk()));
        assertThat(f.get("stages").size()).isEqualTo(7);
        assertThat(f.get("gate").get("phase").asString()).isEqualTo("brief");
        assertThat(f.get("gate").get("missing").toString()).contains("Inviter l'agence marketing");
        assertThat(field(stage(f, "brief"), "titre").get("value").asString()).isEqualTo("Spot Zitouna");   // une seule source : la demande
        send("POST", "/api/demandes/" + id + "/invitations", prod, "{\"email\":\"fiche.marque@exemple.tn\",\"kind\":\"MARQUE\"}").andExpect(status().isOk());
        send("POST", "/api/demandes/" + id + "/invitations", prod, "{\"email\":\"fiche.agence@exemple.tn\",\"kind\":\"AGENCE_MARKETING\"}").andExpect(status().isOk());
        f = read(send("GET", base, brand, null));
        assertThat(stage(f, "brief").get("canEdit").asBoolean()).isTrue();
        assertThat(f.get("stages").toString()).doesNotContain("\"key\":\"concept\"");   // P-087 : le chapitre de l'agence, vide, est masqué pour la marque
        assertThat(f.get("hiddenStages").asInt()).isPositive();
        assertThat(stage(read(send("GET", base, prod, null)), "concept").get("canEdit").asBoolean()).isTrue();   // le producer complète tout
        send("PUT", base + "/champs/objectif", brand, "{\"value\":\"Faire aimer la bouteille\"}").andExpect(status().isOk());
        send("PUT", base + "/champs/idee", brand, "{\"value\":\"Une idee\"}").andExpect(status().isForbidden());
        // Aide à la rédaction : réservée à qui peut écrire le champ ; sans IA, rien n'est inventé
        assertThat(read(send("POST", base + "/champs/cible/proposer", brand, "{\"value\":\"\"}").andExpect(status().isOk())).get("engine").asString()).isEqualTo("AUCUN");
        send("POST", base + "/champs/cible/proposer", agency, null).andExpect(status().isForbidden());
        send("POST", base + "/champs/diffusion/proposer", brand, null).andExpect(status().isBadRequest());
        // Dates de tournage : une période choisie dans le calendrier, premier jour avant le dernier
        send("PUT", base + "/champs/dates_tournage", prod, "{\"value\":\"2027-03-12/2027-03-14\"}").andExpect(status().isOk());
        send("PUT", base + "/champs/dates_tournage", prod, "{\"value\":\"2027-03-14/2027-03-12\"}").andExpect(status().isBadRequest());
        send("PUT", base + "/champs/dates_tournage", prod, "{\"value\":\"mi-mars\"}").andExpect(status().isBadRequest());

        // P-087 · Planning : des étapes datées, construites à partir des dates du film (sans IA : le rétroplanning type)
        JsonNode plan = read(send("POST", base + "/champs/planning/proposer", prod, "{\"value\":\"\"}").andExpect(status().isOk()));
        String steps = plan.get("text").asString();
        assertThat(steps).contains("Tournage").contains("2027-03-12").contains("PPM");
        send("PUT", base + "/champs/planning", prod, json.writeValueAsString(java.util.Map.of("value", steps))).andExpect(status().isOk());
        send("PUT", base + "/champs/planning", prod, json.writeValueAsString(java.util.Map.of("value", "[{\"etape\":\"PPM\",\"debut\":\"2027-03-10\",\"fin\":\"2027-03-09\"}]"))).andExpect(status().isBadRequest());
        send("PUT", base + "/champs/planning", prod, "{\"value\":\"semaine prochaine\"}").andExpect(status().isBadRequest());

        // P-087 · Équipe technique : postes fixes, coordonnées, invitation par lien et mot de passe
        JsonNode withCrew = read(send("PUT", base + "/equipe/chef_operateur", prod, "{\"name\":\"Sami Ben Ali\",\"phone\":\"+216 20 000 000\",\"city\":\"Tunis\"}").andExpect(status().isOk()));
        assertThat(stage(withCrew, "production").get("crew").size()).isEqualTo(14);
        send("PUT", base + "/equipe/chef_operateur", brand, "{\"name\":\"X\"}").andExpect(status().isForbidden());
        send("PUT", base + "/equipe/inconnu", prod, "{\"name\":\"X\"}").andExpect(status().isNotFound());
        String path = read(send("POST", base + "/equipe/ingenieur_son/lien", prod, "{\"name\":\"Nour\",\"email\":\"fiche.son@exemple.tn\"}").andExpect(status().isOk())).get("path").asString();
        String crewToken = path.substring(path.lastIndexOf('/') + 1);
        assertThat(read(send("GET", "/api/public/equipe/" + crewToken, null, null).andExpect(status().isOk())).get("post").asString()).startsWith("Ingénieur");
        send("POST", "/api/public/equipe/" + crewToken, null, "{\"mode\":\"connexion\",\"email\":\"fiche.autre@exemple.tn\",\"password\":\"mauvais-mot-de-passe\"}").andExpect(status().isUnauthorized());
        send("POST", "/api/public/equipe/" + crewToken, null, "{\"mode\":\"creation\",\"email\":\"fiche.autre@exemple.tn\",\"password\":\"Motdepasse-123\",\"firstName\":\"A\",\"lastName\":\"B\",\"acceptTerms\":true}").andExpect(status().isConflict());
        JsonNode joined = read(send("POST", "/api/public/equipe/" + crewToken, null, "{\"mode\":\"creation\",\"email\":\"fiche.son@exemple.tn\",\"password\":\"Motdepasse-123\",\"firstName\":\"Nour\",\"lastName\":\"Son\",\"phone\":\"+216 22 000 000\",\"acceptTerms\":true}").andExpect(status().isOk()));
        String tech = "Bearer " + joined.get("accessToken").asString();
        send("POST", "/api/public/equipe/" + crewToken, null, "{\"mode\":\"connexion\",\"email\":\"fiche.son@exemple.tn\",\"password\":\"Motdepasse-123\"}").andExpect(status().isNotFound());   // usage unique
        JsonNode techView = read(send("GET", base, tech, null).andExpect(status().isOk()));
        assertThat(techView.get("canUpload").asBoolean()).isFalse();
        assertThat(techView.get("stages").toString()).doesNotContain("\"key\":\"brief\"");
        assertThat(stage(techView, "production").get("crew").get(2).get("phone").asString()).isEqualTo("+216 20 000 000");   // l'équipe confirmée voit les coordonnées
        assertThat(stage(read(send("GET", base, brand, null)), "production").get("crew").get(2).get("phone").isNull()).isTrue();   // la marque, non
        send("PUT", base + "/equipe/ingenieur_son", tech, "{\"name\":\"Autre\",\"phone\":\"+216 23 000 000\",\"address\":\"Rue de Marseille, Tunis\"}").andExpect(status().isOk());
        send("PUT", base + "/equipe/chef_operateur", tech, "{\"name\":\"X\"}").andExpect(status().isForbidden());
        send("GET", base, outsider, null).andExpect(status().isNotFound());
        send("POST", base + "/etapes/transmettre", brand, null).andExpect(status().isBadRequest());   // brief incomplet
        send("POST", base + "/etapes/transmettre", agency, null).andExpect(status().isForbidden());

        // La marque dépose son brief : ses chapitres se remplissent, le reste part en propositions
        String doc = com.castingai.sheet.SheetReadingTest.BRIEF + "\nConcept : trois générations autour d'un olivier centenaire\nLieux de tournage : oliveraie de Sfax\n";
        var file = new org.springframework.mock.web.MockMultipartFile("file", "brief.txt", "text/plain", doc.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        mvc.perform(multipart(base + "/sources").file(file).header("Authorization", brand)).andExpect(status().isOk());
        JsonNode done = null;
        for (int i = 0; i < 80; i++) {
            done = read(send("GET", base, brand, null));
            if (!done.get("sources").get(0).get("status").asString().equals("LECTURE")) break;
            Thread.sleep(250);
        }
        assertThat(done.get("sources").get(0).get("status").asString()).isEqualTo("FAIT");
        // P-087 · Le document est conservé : on le voit, on le télécharge, on le partage par lien
        String sid = done.get("sources").get(0).get("id").asString();
        assertThat(done.get("sources").get(0).get("hasFile").asBoolean()).isTrue();
        assertThat(mvc.perform(get(base + "/sources/" + sid + "/fichier").header("Authorization", agency)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).contains("Zitouna");
        send("GET", base + "/sources/" + sid + "/fichier", outsider, null).andExpect(status().isNotFound());
        String shared = read(send("POST", base + "/sources/" + sid + "/partage", agency, null).andExpect(status().isOk())).get("path").asString();
        mvc.perform(get(shared)).andExpect(status().isOk());
        mvc.perform(multipart(base + "/sources").file(new org.springframework.mock.web.MockMultipartFile("file", "photo.exe", "application/octet-stream", new byte[]{1, 2})).header("Authorization", brand)).andExpect(status().isBadRequest());
        assertThat(field(stage(done, "brief"), "cible").get("value").asString()).startsWith("Familles tunisiennes");
        assertThat(field(stage(done, "brief"), "cible").get("source").asString()).isEqualTo("IA");
        assertThat(field(stage(done, "diffusion"), "supports").get("value").asString()).contains("Instagram");
        assertThat(field(stage(done, "brief"), "objectif").get("value").asString()).isEqualTo("Faire aimer la bouteille");   // jamais écrasé
        assertThat(field(stage(done, "brief"), "objectif").get("suggestion").asString()).startsWith("faire connaître");
        assertThat(field(stage(read(send("GET", base, agency, null)), "concept"), "idee").get("suggestion").asString()).contains("olivier");
        assertThat(read(send("GET", "/api/me/notifications", agency, null)).get("items").toString()).contains("pré-rempli");
        send("POST", base + "/champs/objectif/accepter", agency, null).andExpect(status().isForbidden());
        assertThat(field(stage(read(send("POST", base + "/champs/objectif/ecarter", brand, null).andExpect(status().isOk())), "brief"), "objectif").get("suggestion").isNull()).isTrue();

        // Transmission du brief, recommandation, retour de la marque, validation
        assertThat(read(send("POST", base + "/etapes/transmettre", brand, null).andExpect(status().isOk())).get("gate").get("phase").asString()).isEqualTo("recommandation");
        send("POST", base + "/champs/idee/accepter", agency, null).andExpect(status().isOk());
        send("POST", base + "/etapes/presenter", agency, null).andExpect(status().isBadRequest());   // déroulé manquant
        send("PUT", base + "/champs/deroule", agency, "{\"value\":\"La bouteille passe de main en main\"}").andExpect(status().isOk());
        assertThat(read(send("POST", base + "/etapes/presenter", agency, null).andExpect(status().isOk())).get("gate").get("phase").asString()).isEqualTo("validation");
        send("POST", base + "/etapes/valider", agency, null).andExpect(status().isForbidden());
        send("POST", base + "/etapes/valider", prod, null).andExpect(status().isForbidden());   // seule la marque valide
        send("POST", base + "/etapes/modifier", brand, "{\"comment\":\"\"}").andExpect(status().isBadRequest());
        JsonNode back = read(send("POST", base + "/etapes/modifier", brand, "{\"comment\":\"Montrez la famille au réveil\"}").andExpect(status().isOk()));
        assertThat(back.get("gate").get("phase").asString()).isEqualTo("recommandation");
        assertThat(read(send("GET", base, agency, null)).get("gate").get("feedback").asString()).contains("Montrez la famille");
        assertThat(read(send("GET", "/api/demandes/" + id + "/discussion", agency, null)).get("comments").toString()).contains("Montrez la famille");
        send("POST", base + "/etapes/presenter", agency, null).andExpect(status().isOk());
        assertThat(read(send("POST", base + "/etapes/valider", brand, null).andExpect(status().isOk())).get("gate").get("phase").asString()).isEqualTo("preparation");

        // Préparation : rôles écrits dans le dossier, puis le casting ouvre la room
        send("POST", base + "/roles", brand, "{\"name\":\"La grand-mère\"}").andExpect(status().isForbidden());
        JsonNode withRole = read(send("POST", base + "/roles", prod, "{\"name\":\"La grand-mère\",\"gender\":\"Femme\",\"minAge\":60,\"maxAge\":75}").andExpect(status().isOk()));
        String roleId = stage(withRole, "roles").get("roles").get(0).get("id").asString();
        send("POST", base + "/etapes/lancer", prod, null).andExpect(status().isBadRequest());   // intention manquante
        send("PUT", base + "/roles/" + roleId, prod, "{\"name\":\"La grand-mère\",\"intention\":\"Une femme solaire\",\"gender\":\"Femme\",\"minAge\":60,\"maxAge\":75}").andExpect(status().isOk());
        JsonNode launched = read(send("POST", base + "/etapes/lancer", prod, null).andExpect(status().isOk()));
        assertThat(launched.get("gate").get("phase").asString()).isEqualTo("casting");
        String room = launched.get("gate").get("roomId").asString();
        assertThat(room).isNotBlank();
        JsonNode inRoom = read(send("GET", "/api/rooms/" + room + "/fiche", brand, null).andExpect(status().isOk()));
        assertThat(inRoom.get("requestId").asString()).isEqualTo(id);
        assertThat(read(send("GET", "/api/rooms/" + room, brand, null)).get("roles").get(0).get("name").asString()).isEqualTo("La grand-mère");
        send("POST", base + "/roles", prod, "{\"name\":\"Le petit-fils\"}").andExpect(status().isBadRequest());   // les rôles vivent désormais dans la room
        send("POST", base + "/liens", brand, "{\"url\":\"https://127.0.0.1/brief\"}").andExpect(status().isBadRequest());
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
