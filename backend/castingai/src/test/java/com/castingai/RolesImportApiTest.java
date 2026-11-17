package com.castingai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
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
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("pgvector/pgvector:pg16").asCompatibleSubstituteFor("postgres"));

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private ResultActions login(String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email, "password", password))));
    }

    private String token(String email, String password) throws Exception {
        return "Bearer " + read(login(email, password).andExpect(status().isOk())).get("accessToken").asText();
    }

    private String admin() throws Exception { return token("ahmed@casting.com", "password123"); }

    private ResultActions send(String method, String url, String a, Object body) throws Exception {
        var req = switch (method) { case "POST" -> post(url); case "PUT" -> put(url); case "PATCH" -> patch(url); default -> get(url); };
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

    @Test
    void inscriptionCreeUnCompteActeurQuiNeVoitQueSaFiche() throws Exception {
        JsonNode reg = read(send("POST", "/api/auth/register", null, Map.of("email", "Nina.Free@Test.local",
                "password", "motdepasse123", "firstName", "Nina", "lastName", "Libre")).andExpect(status().isCreated()));
        assertThat(reg.get("role").asText()).isEqualTo("ACTEUR");
        String nina = "Bearer " + reg.get("accessToken").asText();

        JsonNode me = read(send("GET", "/api/me", nina, null).andExpect(status().isOk()));
        assertThat(me.get("email").asText()).isEqualTo("nina.free@test.local");
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
        send("GET", "/api/actors/" + me.get("actorId").asText(), admin(), null).andExpect(status().isOk())
                .andExpect(jsonPath("$.city").value("Lyon"));

        // Deux fois la même adresse : refusé
        send("POST", "/api/auth/register", null, Map.of("email", "nina.free@test.local",
                "password", "motdepasse123", "firstName", "Nina", "lastName", "Bis")).andExpect(status().isConflict());
    }

    @Test
    void agentCreeParAdminTravailleMaisNAdministrePas() throws Exception {
        // Un agent appartient à une agence cliente sous contrat
        send("POST", "/api/admin/agents", admin(), Map.of("email", "sans.agence@test.local", "firstName", "Sans", "lastName", "Agence"))
                .andExpect(status().isBadRequest());
        String agency = read(send("POST", "/api/admin/agencies", admin(), Map.of("name", "Studio Lumière", "contractStart", "2026-01-01",
                "contractEnd", "2027-12-31", "maxAgents", 1)).andExpect(status().isCreated())).get("id").asText();
        send("POST", "/api/admin/agencies", admin(), Map.of("name", "Studio X", "contractStart", "2026-06-01", "contractEnd", "2026-01-01"))
                .andExpect(status().isBadRequest());
        JsonNode created = read(send("POST", "/api/admin/agents", admin(),
                Map.of("email", "agent.s7@test.local", "firstName", "Karim", "lastName", "Agent", "agencyId", agency)).andExpect(status().isCreated()));
        assertThat(created.get("user").get("agencyName").asText()).isEqualTo("Studio Lumière");
        // Contrat limité à 1 agent : le second est refusé
        send("POST", "/api/admin/agents", admin(), Map.of("email", "agent2.s7@test.local", "firstName", "Second", "lastName", "Agent", "agencyId", agency))
                .andExpect(status().isConflict());
        String temp = created.get("temporaryPassword").asText();
        assertThat(temp).hasSize(12);
        assertThat(created.get("user").get("role").asText()).isEqualTo("AGENT");

        String agent = token("agent.s7@test.local", temp);
        send("GET", "/api/projects", agent, null).andExpect(status().isOk());
        send("GET", "/api/admin/overview", agent, null).andExpect(status().isForbidden());
        send("GET", "/api/me/actor", agent, null).andExpect(status().isForbidden());

        // Désactivé par l'administrateur : plus de connexion, message clair
        String id = created.get("user").get("id").asText();
        send("PATCH", "/api/admin/users/" + id, admin(), Map.of("enabled", false)).andExpect(jsonPath("$.enabled").value(false));
        login("agent.s7@test.local", temp).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Ce compte est désactivé. Contactez l'administrateur de l'agence."));
        login("agent.s7@test.local", "mauvais-mot-de-passe").andExpect(status().isUnauthorized());
    }

    @Test
    void unActeurNeRejointPasUnProjet() throws Exception {
        send("POST", "/api/auth/register", null, Map.of("email", "acteur.equipe@test.local",
                "password", "motdepasse123", "firstName", "Paul", "lastName", "Equipe")).andExpect(status().isCreated());
        String a = admin();
        String p = read(send("POST", "/api/projects", a, Map.of("title", "Projet fermé", "type", "SERIE"))).get("id").asText();
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
        assertThat(r1.get("status").asText()).isEqualTo("OK");
        JsonNode d = r1.get("data");
        assertThat(d.get("firstName").asText()).isEqualTo("Jean-Pierre");
        assertThat(d.get("lastName").asText()).isEqualTo("Durand");
        assertThat(d.get("gender").asText()).isEqualTo("Homme");
        assertThat(d.get("height").asInt()).isEqualTo(182);
        assertThat(d.get("phone").asText()).isEqualTo("0612345678");
        assertThat(d.get("email").asText()).isEqualTo("jp.durand@mail.com");
        assertThat(d.get("languages").get(0).get("name").asText()).isEqualTo("Anglais");
        assertThat(d.get("languages").get(0).get("level").asText()).isEqualTo("Courant");
        assertThat(d.get("languages").get(1).get("name").asText()).isEqualTo("Français");
        assertThat(d.get("skills").get(0).get("name").asText()).isEqualTo("Hip-hop");
        assertThat(d.get("skills").get(1).get("name").asText()).isEqualTo("Escrime");

        assertThat(pv.get("rows").get(1).get("errors").get(0).asText()).contains("31/02/1995");
        assertThat(pv.get("rows").get(2).get("status").asText()).isEqualTo("DOUBLON");
        assertThat(pv.get("rows").get(3).get("errors").toString()).contains("Adresse e-mail invalide");

        // Enregistrement de la ligne valide, puis une seconde fois : écartée car déjà en base
        String body = json.writeValueAsString(Map.of("rows", java.util.List.of(d)));
        send("POST", "/api/admin/import/actors", a, body).andExpect(status().isOk())
                .andExpect(jsonPath("$.created").value(1));
        send("POST", "/api/admin/import/actors", a, body).andExpect(jsonPath("$.created").value(0))
                .andExpect(jsonPath("$.skipped[0].reason").value("Déjà en base : même adresse e-mail"));
        JsonNode again = preview(a, "acteurs.csv", csv.getBytes(StandardCharsets.UTF_8));
        assertThat(again.get("rows").get(0).get("status").asText()).isEqualTo("DOUBLON");
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
        assertThat(row.get("status").asText()).isEqualTo("OK");
        JsonNode d = row.get("data");
        assertThat(d.get("firstName").asText()).isEqualTo("Inès");
        assertThat(d.get("lastName").asText()).isEqualTo("Belkacem");
        assertThat(d.get("birthDate").asText()).isEqualTo("1998-07-14");
        assertThat(d.get("height").asInt()).isEqualTo(171);
        assertThat(d.get("phone").asText()).isEqualTo("0698765432");
        assertThat(d.get("city").asText()).isEqualTo("Marseille");
        assertThat(pv.get("columns").get(1).get("field").asText()).isEqualTo("birthDate");

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
        String nina = "Bearer " + read(send("POST", "/api/auth/register", null, Map.of("email", "stats.acteur@test.local",
                "password", "motdepasse123", "firstName", "Stat", "lastName", "Acteur"))).get("accessToken").asText();
        send("GET", "/api/admin/stats", nina, null).andExpect(status().isForbidden());
    }
}
