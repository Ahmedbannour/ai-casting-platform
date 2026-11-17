package com.castingai;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
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

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Rôles (admin, agent, acteur freelance) et import de fichiers d'acteurs. */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class RolesImportApiTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private ResultActions login(String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", password))));
    }

    private String token(String email, String password) throws Exception {
        return "Bearer " + read(login(email, password).andExpect(status().isOk())).get("accessToken").asString();
    }

    private String admin() throws Exception { return token("ahmed@casting.com", "password123"); }

    private ResultActions send(String method, String url, String a, Object body) throws Exception {
        var req = switch (method) { case "POST" -> post(url); case "PUT" -> put(url); case "PATCH" -> patch(url); case "DELETE" -> delete(url); default -> get(url); };
        if (a != null) req.header("Authorization", a);
        if (body != null) req.contentType(MediaType.APPLICATION_JSON).content(body instanceof String s ? s : json.writeValueAsString(body));
        return mvc.perform(req);
    }

    private JsonNode read(ResultActions r) throws Exception { return json.readTree(r.andReturn().getResponse().getContentAsString()); }

    private JsonNode preview(String a, String name, byte[] bytes) throws Exception {
        return read(mvc.perform(multipart("/api/admin/import/actors/preview")
                .file(new MockMultipartFile("file", name, "application/octet-stream", bytes))
                .header("Authorization", a)).andExpect(status().isOk()));
    }

    /** T-101 · Aucun compte sans accord daté ; mineur = représentant légal ; compte existant = accord à la connexion. */
    @Test
    void consentementDateEtVersionne() throws Exception {
        var base = new java.util.HashMap<String, Object>(Map.of("email", "lea.consent@test.local", "password", "motdepasse123", "firstName", "Léa", "lastName", "Accord"));
        assertThat(read(send("POST", "/api/auth/register", null, base).andExpect(status().isBadRequest())).get("message").asString()).contains("conditions");
        base.put("acceptTerms", true); base.put("age", "MINEUR");
        assertThat(read(send("POST", "/api/auth/register", null, base).andExpect(status().isBadRequest())).get("message").asString()).contains("représentant légal");
        base.put("guardianName", "Samia Accord");
        String lea = "Bearer " + read(send("POST", "/api/auth/register", null, base).andExpect(status().isCreated())).get("accessToken").asString();
        JsonNode st = read(send("GET", "/api/me/consent", lea, null).andExpect(status().isOk()));
        assertThat(st.get("required").asBoolean()).isFalse();
        assertThat(st.get("version").asString()).isEqualTo(com.castingai.service.ConsentService.VERSION);

        String a = admin();   // compte créé avant les conditions : accord demandé
        assertThat(read(send("GET", "/api/me/consent", a, null)).get("required").asBoolean()).isTrue();
        send("POST", "/api/me/consent", a, Map.of("accept", false, "age", "MAJEUR")).andExpect(status().isBadRequest());
        assertThat(read(send("POST", "/api/me/consent", a, Map.of("accept", true, "age", "MAJEUR")).andExpect(status().isOk())).get("required").asBoolean()).isFalse();
    }

    @Test
    void inscriptionCreeUnCompteActeurQuiNeVoitQueSaFiche() throws Exception {
        JsonNode reg = read(send("POST", "/api/auth/register", null, Map.of("acceptTerms", true, "age", "MAJEUR", "email", "Nina.Free@Test.local",
                "password", "motdepasse123", "firstName", "Nina", "lastName", "Libre")).andExpect(status().isCreated()));
        assertThat(reg.get("role").asString()).isEqualTo("ACTEUR");
        String nina = "Bearer " + reg.get("accessToken").asString();

        JsonNode me = read(send("GET", "/api/me", nina, null).andExpect(status().isOk()));
        assertThat(me.get("email").asString()).isEqualTo("nina.free@test.local");
        assertThat(me.get("actorId").isNull()).isFalse();

        send("GET", "/api/me/actor", nina, null).andExpect(status().isOk()).andExpect(jsonPath("$.firstName").value("Nina"));
        send("PUT", "/api/me/actor", nina, "{\"firstName\":\"Nina\",\"lastName\":\"Libre\",\"height\":168,\"city\":\"Lyon\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.height").value(168));
        send("PUT", "/api/me/actor", nina, "{\"height\":400}").andExpect(status().isBadRequest());

        // Rien d'autre : ni les autres acteurs, ni les projets, ni l'administration
        send("GET", "/api/actors", nina, null).andExpect(status().isForbidden());
        send("GET", "/api/projects", nina, null).andExpect(status().isForbidden());
        send("GET", "/api/admin/users", nina, null).andExpect(status().isForbidden());

        // L'agence, elle, voit la fiche du freelance
        send("GET", "/api/actors/" + me.get("actorId").asString(), admin(), null).andExpect(status().isOk())
                .andExpect(jsonPath("$.city").value("Lyon"));

        // Deux fois la même adresse : refusé
        send("POST", "/api/auth/register", null, Map.of("acceptTerms", true, "age", "MAJEUR", "email", "nina.free@test.local",
                "password", "motdepasse123", "firstName", "Nina", "lastName", "Bis")).andExpect(status().isConflict());
    }

    @Test
    void agentCreeParAdminTravailleMaisNAdministrePas() throws Exception {
        // Un agent appartient à une agence cliente sous contrat
        send("POST", "/api/admin/agents", admin(), Map.of("email", "sans.agence@test.local", "firstName", "Sans", "lastName", "Agence"))
                .andExpect(status().isBadRequest());
        String agency = read(send("POST", "/api/admin/agencies", admin(), Map.of("name", "Studio Lumière", "contractStart", "2026-01-01",
                "contractEnd", "2027-12-31", "maxAgents", 1)).andExpect(status().isCreated())).get("id").asString();
        send("POST", "/api/admin/agencies", admin(), Map.of("name", "Studio X", "contractStart", "2026-06-01", "contractEnd", "2026-01-01"))
                .andExpect(status().isBadRequest());
        JsonNode created = read(send("POST", "/api/admin/agents", admin(),
                Map.of("email", "agent.s7@test.local", "firstName", "Karim", "lastName", "Agent", "agencyId", agency)).andExpect(status().isCreated()));
        assertThat(created.get("user").get("agencyName").asString()).isEqualTo("Studio Lumière");
        // Contrat limité à 1 agent : le second est refusé
        send("POST", "/api/admin/agents", admin(), Map.of("email", "agent2.s7@test.local", "firstName", "Second", "lastName", "Agent", "agencyId", agency))
                .andExpect(status().isConflict());
        String temp = created.get("temporaryPassword").asString();
        assertThat(temp).hasSize(12);
        assertThat(created.get("user").get("role").asString()).isEqualTo("AGENT");

        String agent = token("agent.s7@test.local", temp);
        send("GET", "/api/projects", agent, null).andExpect(status().isOk());
        send("GET", "/api/admin/overview", agent, null).andExpect(status().isForbidden());
        send("GET", "/api/me/actor", agent, null).andExpect(status().isForbidden());

        // Désactivé par l'administrateur : plus de connexion, message clair
        String id = created.get("user").get("id").asString();
        send("PATCH", "/api/admin/users/" + id, admin(), Map.of("enabled", false)).andExpect(jsonPath("$.enabled").value(false));
        login("agent.s7@test.local", temp).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Ce compte est désactivé. Contactez l'administrateur de l'agence."));
        login("agent.s7@test.local", "mauvais-mot-de-passe").andExpect(status().isUnauthorized());
    }

    @Test
    void unActeurNeRejointPasUnProjet() throws Exception {
        send("POST", "/api/auth/register", null, Map.of("acceptTerms", true, "age", "MAJEUR", "email", "acteur.equipe@test.local",
                "password", "motdepasse123", "firstName", "Paul", "lastName", "Equipe")).andExpect(status().isCreated());
        String a = admin();
        String p = read(send("POST", "/api/projects", a, Map.of("title", "Projet fermé", "type", "SERIE"))).get("id").asString();
        send("POST", "/api/projects/" + p + "/members", a, Map.of("email", "acteur.equipe@test.local"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void importCsvNettoieSignaleEtEvitesLesDoublons() throws Exception {
        String csv = String.join("\r\n",
                "Prénom;NOM;Date de naissance;Sexe;Taille;Téléphone;E-mail;Langues;Compétences",
                "jean-pierre;DURAND;12/03/1990;H;1m82;612345678;JP.Durand@Mail.com;anglais (courant), FR;Hip-hop et escrime",
                "Léa;Martin;31/02/1995;F;165;;lea.martin@test.local;;",
                "Jean;Copie;01/01/1991;M;180;;jp.durand@mail.com;;",
                "Sam;Petit;;f;;;sam@x;;",
                ";;;;;;;;");
        String a = admin();
        JsonNode pv = preview(a, "acteurs.csv", csv.getBytes(StandardCharsets.UTF_8));
        assertThat(pv.get("totalRows").asInt()).isEqualTo(4);
        assertThat(pv.get("ok").asInt()).isEqualTo(1);
        assertThat(pv.get("errors").asInt()).isEqualTo(2);
        assertThat(pv.get("duplicates").asInt()).isEqualTo(1);

        JsonNode r1 = pv.get("rows").get(0);
        assertThat(r1.get("status").asString()).isEqualTo("OK");
        JsonNode d = r1.get("data");
        assertThat(d.get("firstName").asString()).isEqualTo("Jean-Pierre");
        assertThat(d.get("lastName").asString()).isEqualTo("Durand");
        assertThat(d.get("gender").asString()).isEqualTo("Homme");
        assertThat(d.get("height").asInt()).isEqualTo(182);
        assertThat(d.get("phone").asString()).isEqualTo("0612345678");
        assertThat(d.get("email").asString()).isEqualTo("jp.durand@mail.com");
        assertThat(d.get("languages").get(0).get("name").asString()).isEqualTo("Anglais");
        assertThat(d.get("languages").get(0).get("level").asString()).isEqualTo("Courant");
        assertThat(d.get("languages").get(1).get("name").asString()).isEqualTo("Français");
        assertThat(d.get("skills").get(0).get("name").asString()).isEqualTo("Hip-hop");
        assertThat(d.get("skills").get(1).get("name").asString()).isEqualTo("Escrime");

        assertThat(pv.get("rows").get(1).get("errors").get(0).asString()).contains("31/02/1995");
        assertThat(pv.get("rows").get(2).get("status").asString()).isEqualTo("DOUBLON");
        assertThat(pv.get("rows").get(3).get("errors").toString()).contains("Adresse e-mail invalide");

        // Enregistrement de la ligne valide, puis une seconde fois : écartée car déjà en base
        String body = json.writeValueAsString(Map.of("rows", java.util.List.of(d)));
        send("POST", "/api/admin/import/actors", a, body).andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(1));
        send("POST", "/api/admin/import/actors", a, body).andExpect(jsonPath("$.created").value(0))
                .andExpect(jsonPath("$.skipped[0].reason").value("Déjà en base : même adresse e-mail"));
        JsonNode again = preview(a, "acteurs.csv", csv.getBytes(StandardCharsets.UTF_8));
        assertThat(again.get("rows").get(0).get("status").asString()).isEqualTo("DOUBLON");
    }

    @Test
    void importExcelAvecVraiesDatesEtNumeros() throws Exception {
        byte[] xlsx;
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sh = wb.createSheet("Acteurs");
            CellStyle dateStyle = wb.createCellStyle();
            dateStyle.setDataFormat(wb.getCreationHelper().createDataFormat().getFormat("dd/mm/yyyy"));
            Row h = sh.createRow(0);
            String[] heads = {"Nom complet", "Né le", "Genre", "Taille (cm)", "Mobile", "Ville"};
            for (int i = 0; i < heads.length; i++) h.createCell(i).setCellValue(heads[i]);
            Row r = sh.createRow(1);
            r.createCell(0).setCellValue("Inès   BELKACEM");
            var c = r.createCell(1); c.setCellValue(LocalDate.of(1998, 7, 14)); c.setCellStyle(dateStyle);
            r.createCell(2).setCellValue("Femme");
            r.createCell(3).setCellValue(171);
            r.createCell(4).setCellValue(698765432d);      // zéro initial perdu par Excel
            r.createCell(5).setCellValue("marseille");
            wb.write(out);
            xlsx = out.toByteArray();
        }
        JsonNode pv = preview(admin(), "casting.xlsx", xlsx);
        JsonNode row = pv.get("rows").get(0);
        assertThat(row.get("status").asString()).isEqualTo("OK");
        JsonNode d = row.get("data");
        assertThat(d.get("firstName").asString()).isEqualTo("Inès");
        assertThat(d.get("lastName").asString()).isEqualTo("Belkacem");
        assertThat(d.get("birthDate").asString()).isEqualTo("1998-07-14");
        assertThat(d.get("height").asInt()).isEqualTo(171);
        assertThat(d.get("phone").asString()).isEqualTo("0698765432");
        assertThat(d.get("city").asString()).isEqualTo("Marseille");
        assertThat(pv.get("columns").get(1).get("field").asString()).isEqualTo("birthDate");

        mvc.perform(multipart("/api/admin/import/actors/preview")
                        .file(new MockMultipartFile("file", "notes.pdf", "application/pdf", new byte[]{1, 2, 3}))
                        .header("Authorization", admin()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Format non pris en charge : fichier Excel (.xlsx) ou CSV attendu"));
    }

    @Test
    void tableauDeBordDeLaPlateforme() throws Exception {
        String a = admin();
        JsonNode st = read(send("GET", "/api/admin/stats?months=6", a, null).andExpect(status().isOk()));
        assertThat(st.get("monthly").size()).isEqualTo(6);
        assertThat(st.get("kpis").get("actors").asLong()).isGreaterThan(0);
        assertThat(st.get("pipeline").size()).isEqualTo(5);
        assertThat(st.get("ages").size()).isGreaterThan(0);
        send("GET", "/api/admin/projects", a, null).andExpect(status().isOk());
        send("GET", "/api/admin/agencies", a, null).andExpect(status().isOk());
        // Réservé à l'administrateur
        String nina = "Bearer " + read(send("POST", "/api/auth/register", null, Map.of("acceptTerms", true, "age", "MAJEUR", "email", "stats.acteur@test.local",
                "password", "motdepasse123", "firstName", "Stat", "lastName", "Acteur"))).get("accessToken").asString();
        send("GET", "/api/admin/stats", nina, null).andExpect(status().isForbidden());
    }

    @Test
    void contratEchuLectureSeule() throws Exception {
        String a = admin();
        String agency = read(send("POST", "/api/admin/agencies", a, Map.of("name", "Agence échue", "contractStart", "2024-01-01",
                "contractEnd", "2024-12-31")).andExpect(status().isCreated())).get("id").asString();
        assertThat(read(send("GET", "/api/admin/agencies", a, null)).toString()).contains("EXPIRE");
        send("POST", "/api/admin/agents", a, Map.of("email", "agent.echu@test.local", "firstName", "Eric", "lastName", "Echu",
                "password", "motdepasse123", "agencyId", agency)).andExpect(status().isCreated());
        String agent = token("agent.echu@test.local", "motdepasse123");

        send("GET", "/api/me", agent, null).andExpect(jsonPath("$.contractStatus").value("EXPIRE"))
                .andExpect(jsonPath("$.agencyName").value("Agence échue"));
        send("GET", "/api/projects", agent, null).andExpect(status().isOk());                       // lecture : oui
        send("POST", "/api/projects", agent, Map.of("title", "Interdit", "type", "SERIE"))           // écriture : non
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("CONTRAT_INACTIF"));

        // Contrat prolongé par l'administrateur : l'agent retravaille aussitôt
        send("PUT", "/api/admin/agencies/" + agency, a, Map.of("name", "Agence échue", "contractStart", "2024-01-01",
                "contractEnd", "2099-12-31")).andExpect(jsonPath("$.status").value("ACTIF"));
        send("POST", "/api/projects", agent, Map.of("title", "Autorisé", "type", "SERIE")).andExpect(status().isCreated());
    }

    @Test
    void acteurEnPauseSortDesRecherches() throws Exception {
        String z = "Bearer " + read(send("POST", "/api/auth/register", null, Map.of("acceptTerms", true, "age", "MAJEUR", "email", "zelie.pause@test.local",
                "password", "motdepasse123", "firstName", "Zélie", "lastName", "Pausemaker")).andExpect(status().isCreated()))
                .get("accessToken").asString();
        String a = admin();
        send("GET", "/api/me/visibility", z, null).andExpect(jsonPath("$.visibility").value("VISIBLE"));
        send("GET", "/api/actors/search?search=Pausemaker", a, null).andExpect(jsonPath("$.totalElements").value(1));

        send("PUT", "/api/me/visibility", z, Map.of("visibility", "PAUSE"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.visibility").value("PAUSE"))
                .andExpect(jsonPath("$.changedAt").isNotEmpty());
        send("GET", "/api/actors/search?search=Pausemaker", a, null).andExpect(jsonPath("$.totalElements").value(0));
        send("GET", "/api/actors?search=Pausemaker", a, null).andExpect(jsonPath("$.totalElements").value(0));

        send("PUT", "/api/me/visibility", z, Map.of("visibility", "CACHE")).andExpect(status().isBadRequest());
        send("PUT", "/api/me/visibility", a, Map.of("visibility", "PAUSE")).andExpect(status().isForbidden());

        send("PUT", "/api/me/visibility", z, Map.of("visibility", "VISIBLE")).andExpect(status().isOk());
        send("GET", "/api/actors/search?search=Pausemaker", a, null).andExpect(jsonPath("$.totalElements").value(1));
    }

    private String agentOf(String agencyName, String email) throws Exception {
        String ag = read(send("POST", "/api/admin/agencies", admin(), Map.of("name", agencyName, "contractStart", "2026-01-01",
                "contractEnd", "2030-12-31", "maxAgents", 5)).andExpect(status().isCreated())).get("id").asString();
        send("POST", "/api/admin/agents", admin(), Map.of("email", email, "firstName", "Agent", "lastName", agencyName,
                "password", "motdepasse123", "agencyId", ag)).andExpect(status().isCreated());
        return token(email, "motdepasse123");
    }

    @Test
    void chaqueAgenceGardeSesActeursEtSonEquipe() throws Exception {
        String a = agentOf("Agence Alpha", "agent.alpha@test.local");
        String b = agentOf("Agence Beta", "agent.beta@test.local");

        // Alpha apporte une fiche : elle lui reste privée
        String id = read(send("POST", "/api/actors", a, Map.of("firstName", "Ines", "lastName", "Privatalpha"))
                .andExpect(status().isCreated())).get("id").asString();
        send("GET", "/api/actors/search?search=Privatalpha", a, null).andExpect(jsonPath("$.totalElements").value(1));
        send("GET", "/api/actors/" + id, a, null).andExpect(status().isOk());

        send("GET", "/api/actors/search?search=Privatalpha", b, null).andExpect(jsonPath("$.totalElements").value(0));
        send("GET", "/api/actors?search=Privatalpha", b, null).andExpect(jsonPath("$.totalElements").value(0));
        send("GET", "/api/actors/" + id, b, null).andExpect(status().isNotFound());
        send("GET", "/api/actors/" + id + "/photos", b, null).andExpect(status().isNotFound());
        send("GET", "/api/actors/" + id + "/detail", b, null).andExpect(status().isNotFound());

        // L'administrateur voit tout ; le vivier (freelances) reste visible de tous
        send("GET", "/api/actors/" + id, admin(), null).andExpect(status().isOk());
        send("POST", "/api/auth/register", null, Map.of("acceptTerms", true, "age", "MAJEUR", "email", "vivier.libre@test.local", "password", "motdepasse123",
                "firstName", "Vivier", "lastName", "Partagelibre")).andExpect(status().isCreated());
        send("GET", "/api/actors/search?search=Partagelibre", b, null).andExpect(jsonPath("$.totalElements").value(1));

        // Beta ne peut pas glisser la fiche d'Alpha dans sa shortlist
        String pb = read(send("POST", "/api/projects", b, Map.of("title", "Projet Beta", "type", "SERIE"))).get("id").asString();
        String rb = read(send("POST", "/api/projects/" + pb + "/roles", b, Map.of("name", "Rôle Beta"))).get("id").asString();
        send("POST", "/api/roles/" + rb + "/shortlist", b, Map.of("actorId", id)).andExpect(status().isNotFound());

        // L'équipe d'un projet reste dans l'agence
        String pa = read(send("POST", "/api/projects", a, Map.of("title", "Projet Alpha", "type", "SERIE"))).get("id").asString();
        send("POST", "/api/projects/" + pa + "/members", a, Map.of("email", "agent.beta@test.local"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void coordonneesProtegeesEtConsultationsTracees() throws Exception {
        String g = agentOf("Agence Gamma", "agent.gamma@test.local");
        String f = "Bearer " + read(send("POST", "/api/auth/register", null, Map.of("acceptTerms", true, "age", "MAJEUR", "email", "lina.contact@test.local",
                "password", "motdepasse123", "firstName", "Lina", "lastName", "Contactable")).andExpect(status().isCreated()))
                .get("accessToken").asString();
        String id = read(send("GET", "/api/me", f, null)).get("actorId").asString();
        send("PUT", "/api/me/actor", f, Map.of("firstName", "Lina", "lastName", "Contactable", "phone", "+33612345678"))
                .andExpect(jsonPath("$.phone").value("+33612345678"));

        // Fiche du vivier : coordonnées masquées pour l'agent
        send("GET", "/api/actors/" + id, g, null).andExpect(jsonPath("$.contactHidden").value(true))
                .andExpect(jsonPath("$.phone").doesNotExist());
        send("GET", "/api/actors/" + id + "/detail", g, null).andExpect(jsonPath("$.contactHidden").value(true));
        // Un agent qui modifie la fiche ne peut pas écraser ce qu'il ne voit pas
        send("PUT", "/api/actors/" + id, g, Map.of("phone", "", "city", "Sousse")).andExpect(status().isOk());

        // Il les demande : consultation tracée, visible de l'acteur
        send("POST", "/api/actors/" + id + "/contact", g, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").value("+33612345678")).andExpect(jsonPath("$.email").value("lina.contact@test.local"));
        send("GET", "/api/me/contact-views", f, null).andExpect(jsonPath("$[0].who").value("Agence Gamma"));
        send("GET", "/api/me/contact-views", g, null).andExpect(status().isForbidden());

        // L'administrateur voit tout ; l'agence voit les fiches qu'elle a apportées
        send("GET", "/api/actors/" + id, admin(), null).andExpect(jsonPath("$.contactHidden").value(false))
                .andExpect(jsonPath("$.phone").value("+33612345678"));
        String own = read(send("POST", "/api/actors", g, Map.of("firstName", "Omar", "lastName", "Maison", "phone", "+21698765432"))).get("id").asString();
        send("GET", "/api/actors/" + own, g, null).andExpect(jsonPath("$.contactHidden").value(false))
                .andExpect(jsonPath("$.phone").value("+21698765432"));
    }

    @Test
    void propositionEtConvocationAcceptees() throws Exception {
        String d = agentOf("Agence Delta", "agent.delta@test.local");
        String f = "Bearer " + read(send("POST", "/api/auth/register", null, Map.of("acceptTerms", true, "age", "MAJEUR", "email", "sami.offre@test.local",
                "password", "motdepasse123", "firstName", "Sami", "lastName", "Offrable")).andExpect(status().isCreated()))
                .get("accessToken").asString();
        String actorId = read(send("GET", "/api/me", f, null)).get("actorId").asString();

        String p = read(send("POST", "/api/projects", d, Map.of("title", "Les Phares", "type", "SERIE"))).get("id").asString();
        String r = read(send("POST", "/api/projects/" + p + "/roles", d, Map.of("name", "Yanis, gardien de phare",
                "shootStart", "2027-05-01", "shootEnd", "2027-06-30"))).get("id").asString();
        String e = read(send("POST", "/api/roles/" + r + "/shortlist", d, Map.of("actorId", actorId)).andExpect(status().isCreated())).get("id").asString();

        // Convocation : date obligatoire, avant la fin du tournage
        send("POST", "/api/shortlist/" + e + "/offers", d, Map.of("kind", "AUDITION")).andExpect(status().isBadRequest());
        send("POST", "/api/shortlist/" + e + "/offers", d, Map.of("kind", "AUDITION", "auditionDate", "2027-08-01")).andExpect(status().isBadRequest());
        send("POST", "/api/shortlist/" + e + "/offers", d, Map.of("kind", "AUDITION", "auditionDate", "2027-04-12",
                "message", "Scène 4, texte joint par e-mail")).andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("ENVOYEE"));
        send("POST", "/api/shortlist/" + e + "/offers", d, Map.of("kind", "PROPOSITION")).andExpect(status().isConflict());

        // L'acteur la voit dans son espace, avec le rôle et l'agence, et l'accepte
        JsonNode mine = read(send("GET", "/api/me/offers", f, null).andExpect(status().isOk()));
        assertThat(mine.get(0).get("roleName").asString()).isEqualTo("Yanis, gardien de phare");
        assertThat(mine.get(0).get("agencyName").asString()).isEqualTo("Agence Delta");
        String offer = mine.get(0).get("id").asString();
        send("PUT", "/api/me/offers/" + offer, f, Map.of("answer", "ACCEPTEE", "note", "Avec plaisir")).andExpect(status().isNoContent());
        send("PUT", "/api/me/offers/" + offer, f, Map.of("answer", "DECLINEE")).andExpect(status().isConflict());
        send("GET", "/api/me/offers", d, null).andExpect(status().isForbidden());

        // L'agent voit la réponse ; le candidat est passé en audition à la date prévue
        send("GET", "/api/roles/" + r + "/offers", d, null).andExpect(jsonPath("$[0].status").value("ACCEPTEE"))
                .andExpect(jsonPath("$[0].answerNote").value("Avec plaisir"));
        JsonNode list = read(send("GET", "/api/roles/" + r + "/shortlist", d, null));
        assertThat(list.get(0).get("status").asString()).isEqualTo("AUDITION");
        assertThat(list.get(0).get("auditionDate").asString()).isEqualTo("2027-04-12");

        // Fiche sans compte : pas de proposition possible, l'agent contacte l'acteur directement
        String own = read(send("POST", "/api/actors", d, Map.of("firstName", "Sans", "lastName", "Compte"))).get("id").asString();
        String e2 = read(send("POST", "/api/roles/" + r + "/shortlist", d, Map.of("actorId", own))).get("id").asString();
        send("POST", "/api/shortlist/" + e2 + "/offers", d, Map.of("kind", "PROPOSITION")).andExpect(status().isBadRequest());
    }

    @Test
    void notificationsDeLaCloche() throws Exception {
        String d = agentOf("Agence Epsilon", "agent.epsilon@test.local");
        String f = "Bearer " + read(send("POST", "/api/auth/register", null, Map.of("acceptTerms", true, "age", "MAJEUR", "email", "rita.notif@test.local",
                "password", "motdepasse123", "firstName", "Rita", "lastName", "Notifiee")).andExpect(status().isCreated()))
                .get("accessToken").asString();
        String actorId = read(send("GET", "/api/me", f, null)).get("actorId").asString();
        send("GET", "/api/me/notifications", f, null).andExpect(jsonPath("$.unread").value(0));

        String p = read(send("POST", "/api/projects", d, Map.of("title", "Projet cloche", "type", "SERIE"))).get("id").asString();
        String r = read(send("POST", "/api/projects/" + p + "/roles", d, Map.of("name", "Rôle cloche"))).get("id").asString();
        String e = read(send("POST", "/api/roles/" + r + "/shortlist", d, Map.of("actorId", actorId))).get("id").asString();

        // Proposition → l'acteur est prévenu
        send("POST", "/api/shortlist/" + e + "/offers", d, Map.of("kind", "PROPOSITION")).andExpect(status().isCreated());
        send("GET", "/api/me/notifications", f, null).andExpect(jsonPath("$.unread").value(1))
                .andExpect(jsonPath("$.items[0].title").value("Proposition de rôle : Rôle cloche"))
                .andExpect(jsonPath("$.items[0].link").value("/mes-propositions"));

        // Réponse → l'agent est prévenu ; consultation des coordonnées → l'acteur aussi
        String offer = read(send("GET", "/api/me/offers", f, null)).get(0).get("id").asString();
        send("PUT", "/api/me/offers/" + offer, f, Map.of("answer", "DECLINEE")).andExpect(status().isNoContent());
        send("GET", "/api/me/notifications", d, null).andExpect(jsonPath("$.items[0].title").value("Rita Notifiee a décliné votre demande"));
        send("POST", "/api/actors/" + actorId + "/contact", d, null).andExpect(status().isOk());
        send("GET", "/api/me/notifications", f, null).andExpect(jsonPath("$.unread").value(2))
                .andExpect(jsonPath("$.items[0].title").value("Agence Epsilon a consulté vos coordonnées"));

        // Avis du réalisateur → le propriétaire du projet est prévenu
        String token = read(send("POST", "/api/roles/" + r + "/shares", d, Map.of("days", 7))).get("token").asString();
        mvc.perform(put("/api/public/shares/" + token + "/votes/" + e).contentType(MediaType.APPLICATION_JSON)
                .content("{\"vote\":\"OUI\",\"voterName\":\"Claire\"}")).andExpect(status().isNoContent());
        send("GET", "/api/me/notifications", d, null).andExpect(jsonPath("$.items[0].title").value("Claire a répondu « oui » pour Rita Notifiee"));

        // Tout marquer comme lu
        send("POST", "/api/me/notifications/read", f, null).andExpect(status().isNoContent());
        send("GET", "/api/me/notifications", f, null).andExpect(jsonPath("$.unread").value(0));
    }

    @Test
    void offreCommercialeEtRevenuMensuel() throws Exception {
        String a = admin();
        String end = java.time.LocalDate.now().plusDays(10).toString();
        send("POST", "/api/admin/agencies", a, Map.of("name", "Agence Zeta", "contractStart", "2026-01-01", "contractEnd", end,
                "plan", "PRO", "monthlyAmount", 450, "currency", "EUR")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.plan").value("PRO")).andExpect(jsonPath("$.monthlyAmount").value(450))
                .andExpect(jsonPath("$.currency").value("EUR"));
        send("POST", "/api/admin/agencies", a, Map.of("name", "Agence Eta", "contractStart", "2026-01-01", "plan", "GRATUIT"))
                .andExpect(status().isBadRequest());
        send("POST", "/api/admin/agencies", a, Map.of("name", "Agence Theta", "contractStart", "2026-01-01", "monthlyAmount", -5))
                .andExpect(status().isBadRequest());

        JsonNode rev = read(send("GET", "/api/admin/stats", a, null).andExpect(status().isOk())).get("revenue");
        boolean eur = false;
        for (JsonNode m : rev.get("mrr")) if (m.get("currency").asString().equals("EUR")) { eur = true; assertThat(m.get("amount").asDouble()).isEqualTo(450.0); }
        assertThat(eur).isTrue();
        boolean found = false;
        for (JsonNode r : rev.get("renewals")) if (r.get("name").asString().equals("Agence Zeta")) { found = true; assertThat(r.get("daysLeft").asLong()).isEqualTo(10); }
        assertThat(found).isTrue();

        // La cloche de l'administrateur rappelle le renouvellement
        String feed = send("GET", "/api/me/notifications", a, null).andReturn().getResponse().getContentAsString();
        assertThat(feed).contains("Contrat de Agence Zeta : fin dans 10 jours");
    }

    @Test
    void journalAuditDeLAdministration() throws Exception {
        String a = admin();
        String ag = read(send("POST", "/api/admin/agencies", a, Map.of("name", "Agence Iota", "contractStart", "2026-01-01"))
                .andExpect(status().isCreated())).get("id").asString();
        send("PUT", "/api/admin/agencies/" + ag, a, Map.of("name", "Agence Iota", "contractStart", "2026-01-01",
                "contractEnd", "2027-06-30", "plan", "STUDIO", "monthlyAmount", 900, "currency", "TND")).andExpect(status().isOk());
        String uid = read(send("POST", "/api/admin/agents", a, Map.of("email", "agent.iota@test.local", "firstName", "Ines",
                "lastName", "Iota", "password", "motdepasse123", "agencyId", ag)).andExpect(status().isCreated())).get("user").get("id").asString();
        send("PATCH", "/api/admin/users/" + uid, a, Map.of("enabled", false)).andExpect(status().isOk());

        JsonNode log = read(send("GET", "/api/admin/audit", a, null).andExpect(status().isOk()));
        String all = log.toString();
        assertThat(all).contains("AGENCE_CREEE").contains("Agence Iota")
                .contains("CONTRAT_MODIFIE").contains("au 30/06/2027, STUDIO, 900 TND/mois")
                .contains("COMPTE_CREE").contains("agent.iota@test.local")
                .contains("COMPTE_MODIFIE").contains("désactivé");
        assertThat(log.get(0).get("actor").asString()).contains("ahmed@casting.com");
        send("GET", "/api/admin/audit?action=COMPTE_MODIFIE", a, null).andExpect(jsonPath("$[0].action").value("COMPTE_MODIFIE"));

        // Réservé à l'administrateur
        send("GET", "/api/admin/audit", agentOf("Agence Kappa", "agent.kappa@test.local"), null).andExpect(status().isForbidden());
    }

    /** T-102 · Invitation à usage unique : l'acteur reprend sa fiche et choisit agence ou vivier. */
    @Test
    void invitationActeurImporte() throws Exception {
        String a = agentOf("Agence Invita", "agent.invita@test.local");
        String b = agentOf("Agence Autre", "agent.autre@test.local");
        String id = read(send("POST", "/api/actors", a, Map.of("firstName", "Nadia", "lastName", "Invitee",
                "email", "nadia.invit@test.local", "phone", "+21655111222")).andExpect(status().isCreated())).get("id").asString();
        String url = "/api/actors/" + id + "/invitation";

        send("POST", url, b, null).andExpect(status().isNotFound());   // fiche d'une autre agence : invisible
        send("GET", url, a, null).andExpect(status().isOk()).andExpect(jsonPath("$.canInvite").value(true))
                .andExpect(jsonPath("$.pendingUntil").doesNotExist());
        String t1 = read(send("POST", url, a, null).andExpect(status().isCreated())).get("token").asString();
        send("GET", url, a, null).andExpect(jsonPath("$.pendingUntil").exists());
        String t2 = read(send("POST", url, a, null).andExpect(status().isCreated())).get("token").asString();
        send("GET", "/api/public/invitations/" + t1, null, null).andExpect(status().isNotFound());
        send("GET", "/api/public/invitations/" + t2, null, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.firstName").value("Nadia")).andExpect(jsonPath("$.agencyName").value("Agence Invita"))
                .andExpect(jsonPath("$.agencyActor").value(true));

        String acc = "/api/public/invitations/" + t2 + "/accept";
        send("POST", acc, null, Map.of("password", "Invitee-12345", "age", "MAJEUR", "joinPool", true)).andExpect(status().isBadRequest());
        send("POST", acc, null, Map.of("password", "court", "acceptTerms", true, "age", "MAJEUR")).andExpect(status().isBadRequest());
        send("POST", acc, null, Map.of("password", "Invitee-12345", "acceptTerms", true, "age", "MAJEUR", "joinPool", true))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.role").value("ACTEUR"));
        send("POST", acc, null, Map.of("password", "Invitee-12345", "acceptTerms", true, "age", "MAJEUR")).andExpect(status().isNotFound());

        String n = token("nadia.invit@test.local", "Invitee-12345");
        send("GET", "/api/me/consent", n, null).andExpect(jsonPath("$.required").value(false));
        send("GET", "/api/me", n, null).andExpect(status().isOk());
        // Fiche passée au vivier : l'agence d'origine garde les coordonnées, l'autre agence doit les demander
        send("GET", "/api/actors/" + id, a, null).andExpect(status().isOk()).andExpect(jsonPath("$.contactHidden").value(false));
        send("GET", "/api/actors/" + id, b, null).andExpect(status().isOk()).andExpect(jsonPath("$.contactHidden").value(true));
        send("GET", url, a, null).andExpect(jsonPath("$.hasAccount").value(true));
        send("POST", url, a, null).andExpect(status().isConflict());

        // Adresse déjà prise → 409 ; fiche gardée chez l'agence → invisible des autres agences
        String id2 = read(send("POST", "/api/actors", a, Map.of("firstName", "Karim", "lastName", "Prive"))).get("id").asString();
        String t3 = read(send("POST", "/api/actors/" + id2 + "/invitation", a, null)).get("token").asString();
        send("POST", "/api/public/invitations/" + t3 + "/accept", null, Map.of("email", "nadia.invit@test.local",
                "password", "Karim-12345", "acceptTerms", true, "age", "MAJEUR")).andExpect(status().isConflict());
        send("POST", "/api/public/invitations/" + t3 + "/accept", null, Map.of("email", "karim.prive@test.local",
                "password", "Karim-12345", "acceptTerms", true, "age", "MINEUR", "guardianName", "Samia Prive", "joinPool", false))
                .andExpect(status().isCreated());
        send("GET", "/api/actors/" + id2, b, null).andExpect(status().isNotFound());
        token("karim.prive@test.local", "Karim-12345");

        // Annulation d'un lien
        String id3 = read(send("POST", "/api/actors", a, Map.of("firstName", "Lina", "lastName", "Annule"))).get("id").asString();
        String t4 = read(send("POST", "/api/actors/" + id3 + "/invitation", a, null)).get("token").asString();
        send("DELETE", "/api/actors/" + id3 + "/invitation", a, null).andExpect(status().isNoContent());
        send("GET", "/api/public/invitations/" + t4, null, null).andExpect(status().isNotFound());
    }

    /** Vitrine · formulaire de contact : enregistré, lu par l'administrateur seulement, robots et abus filtrés. */
    @Test
    void formulaireDeContactDeLaVitrine() throws Exception {
        String url = "/api/public/contact";
        send("POST", url, null, Map.of("name", "A", "email", "x@y.tn", "profile", "AGENCE", "message", "Bonjour, nous sommes une agence.")).andExpect(status().isBadRequest());
        send("POST", url, null, Map.of("name", "Agence Lumière", "email", "pas-un-mail", "profile", "AGENCE", "message", "Bonjour, nous sommes une agence.")).andExpect(status().isBadRequest());
        send("POST", url, null, Map.of("name", "Agence Lumière", "email", "contact@lumiere.tn", "profile", "AGENCE", "message", "court")).andExpect(status().isBadRequest());
        send("POST", url, null, Map.of("name", "Robot", "email", "r@spam.tn", "profile", "AUTRE", "message", "Achetez maintenant !!!", "website", "http://spam")).andExpect(status().isCreated());
        send("POST", url, null, Map.of("name", "Agence Lumière", "email", "Contact@Lumiere.tn", "organisation", "Lumière Films",
                "profile", "AGENCE", "message", "Bonjour, nous aimerions un accès pour trois agents.")).andExpect(status().isCreated());

        String a = admin();
        JsonNode list = read(send("GET", "/api/admin/contact-messages", a, null).andExpect(status().isOk()));
        assertThat(list.get("items").size()).isEqualTo(1);           // le robot n'est pas enregistré
        JsonNode m = list.get("items").get(0);
        assertThat(m.get("email").asString()).isEqualTo("contact@lumiere.tn");
        assertThat(list.get("unread").asInt()).isEqualTo(1);
        send("POST", "/api/admin/contact-messages/" + m.get("id").asString() + "/read", a, null).andExpect(status().isNoContent());
        send("GET", "/api/admin/contact-messages", a, null).andExpect(jsonPath("$.unread").value(0));

        String g = agentOf("Agence Curieuse", "agent.curieux@test.local");
        send("GET", "/api/admin/contact-messages", g, null).andExpect(status().isForbidden());
        send("GET", "/api/admin/contact-messages", null, null).andExpect(status().isUnauthorized());

        for (int i = 0; i < 4; i++) send("POST", url, null, Map.of("name", "Acteur " + i, "email", "a" + i + "@test.tn", "profile", "ACTEUR", "message", "Question sur mon profil numéro " + i));
        send("POST", url, null, Map.of("name", "Acteur 9", "email", "a9@test.tn", "profile", "ACTEUR", "message", "Encore une question sur mon profil"))
                .andExpect(status().isTooManyRequests());
    }

    /** T-112 · Lien de réinitialisation créé par l'administrateur : 1 heure, usage unique, sessions fermées. */
    @Test
    void motDePasseOublieParLienAdministrateur() throws Exception {
        String g = agentOf("Agence Oubli", "agent.oubli@test.local");
        String refresh = read(login("agent.oubli@test.local", "motdepasse123")).get("refreshToken").asString();
        String a = admin();
        String userId = null;
        for (JsonNode u : read(send("GET", "/api/admin/users", a, null)))
            if ("agent.oubli@test.local".equals(u.get("email").asString())) userId = u.get("id").asString();
        assertThat(userId).isNotNull();
        String url = "/api/admin/users/" + userId + "/password-reset";

        send("POST", url, g, null).andExpect(status().isForbidden());                 // seul l'administrateur
        String t1 = read(send("POST", url, a, null).andExpect(status().isCreated())).get("token").asString();
        String t2 = read(send("POST", url, a, null).andExpect(status().isCreated())).get("token").asString();
        send("GET", "/api/public/password-reset/" + t1, null, null).andExpect(status().isNotFound());   // remplacé
        send("GET", "/api/public/password-reset/" + t2, null, null).andExpect(status().isOk())
                .andExpect(jsonPath("$.firstName").value("Agent")).andExpect(jsonPath("$.email").value("a******@test.local"));

        String pr = "/api/public/password-reset/" + t2;
        send("POST", pr, null, Map.of("password", "court")).andExpect(status().isBadRequest());
        send("POST", pr, null, Map.of("password", "NouveauMdp-2026")).andExpect(status().isNoContent());
        send("POST", pr, null, Map.of("password", "EncoreUn-2026")).andExpect(status().isNotFound());   // usage unique

        login("agent.oubli@test.local", "motdepasse123").andExpect(status().isUnauthorized());
        token("agent.oubli@test.local", "NouveauMdp-2026");
        send("POST", "/api/auth/refresh", null, Map.of("refreshToken", refresh)).andExpect(status().isUnauthorized());   // anciennes sessions fermées
    }

    /** T-113 · Adresse e-mail vérifiée par un lien de l'administrateur (usage unique). */
    @Test
    void verificationEmailParLienAdministrateur() throws Exception {
        String ac = read(send("POST", "/api/auth/register", null, Map.of("email", "verif.mail@test.local", "password", "Verif-12345",
                "firstName", "Vera", "lastName", "Mail", "acceptTerms", true, "age", "MAJEUR")).andExpect(status().isCreated())).get("accessToken").asString();
        String me = "Bearer " + ac;
        send("GET", "/api/me/email", me, null).andExpect(jsonPath("$.verified").value(false));
        String a = admin();
        String id = null;
        for (JsonNode u : read(send("GET", "/api/admin/users", a, null))) {
            if ("verif.mail@test.local".equals(u.get("email").asString())) { id = u.get("id").asString(); assertThat(u.get("emailVerified").asBoolean()).isFalse(); }
            if ("ahmed@casting.com".equals(u.get("email").asString())) assertThat(u.get("emailVerified").asBoolean()).isTrue();
        }
        String url = "/api/admin/users/" + id + "/email-verification";
        send("POST", url, me, null).andExpect(status().isForbidden());
        String t1 = read(send("POST", url, a, null).andExpect(status().isCreated())).get("token").asString();
        String t2 = read(send("POST", url, a, null).andExpect(status().isCreated())).get("token").asString();
        send("POST", "/api/public/email-verification/" + t1, null, null).andExpect(status().isNotFound());
        send("POST", "/api/public/email-verification/" + t2, null, null).andExpect(status().isOk()).andExpect(jsonPath("$.firstName").value("Vera"));
        send("POST", "/api/public/email-verification/" + t2, null, null).andExpect(status().isNotFound());
        send("GET", "/api/me/email", me, null).andExpect(jsonPath("$.verified").value(true));
        send("POST", url, a, null).andExpect(status().isConflict());
    }
}
