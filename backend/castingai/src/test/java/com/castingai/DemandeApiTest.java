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

    private int autoProd = 0;

    /** Le producer d'une boîte créée pour l'occasion crée le projet et invite la marque (déjà inscrite) ;
     *  renvoie la création si elle échoue, sinon le projet vu par la marque. */
    private ResultActions create(String admin, String brand, String body) throws Exception {
        int n = ++autoProd;
        String producer = account(admin, "producer" + n + "." + System.nanoTime() + "@auto.tn", "BOITE_PROD",
                org(admin, "Prod Auto " + n + " " + System.nanoTime(), "BOITE_PROD"));
        return create(admin, brand, producer, body);
    }

    /** Le producer donné crée le projet et invite la marque. */
    private ResultActions create(String admin, String brand, String producer, String body) throws Exception {
        ResultActions c = send("POST", "/api/demandes", producer, body);
        if (c.andReturn().getResponse().getStatus() != 201) return c;
        String id = read(c).get("id").asString();
        String brandEmail = read(send("GET", "/api/me", brand, null)).get("email").asString();
        send("POST", "/api/demandes/" + id + "/invitations", producer, "{\"email\":\"" + brandEmail + "\",\"kind\":\"MARQUE\"}").andExpect(status().isOk());
        return send("GET", "/api/demandes/" + id, brand, null);
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

        JsonNode d = read(create(admin, brand, "{\"title\":\"Spot été\",\"product\":\"Jus d'orange\",\"objective\":\"Lancer la gamme\",\"keyMessage\":\"Le soleil en bouteille\"}")
                .andExpect(status().isOk()));
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
        create(admin, brand, "{\"title\":\"\"}").andExpect(status().isBadRequest());
        create(admin, brand, "{\"title\":\"Spot\",\"airDate\":\"2020-01-01\"}").andExpect(status().isBadRequest());
        String id = read(create(admin, brand, "{\"title\":\"Spot hiver\"}").andExpect(status().isOk())).get("id").asString();
        assertThat(read(send("PUT", "/api/demandes/" + id, brand, "{\"title\":\"Spot hiver chaud\",\"target\":\"Familles\"}")).get("target").asString()).isEqualTo("Familles");
        assertThat(read(send("POST", "/api/demandes/" + id + "/annuler", brand, null)).get("status").asString()).isEqualTo("ANNULEE");
        String id2 = read(create(admin, brand, "{\"title\":\"À effacer\"}")).get("id").asString();
        // Le projet appartient au producer : la marque l'annule, mais ne le supprime pas
        send("DELETE", "/api/demandes/" + id2, brand, null).andExpect(status().isForbidden());
    }

    /** Sprint 3 · T-160 : l'agence refuse (retour en brouillon chez la marque), puis une autre accepte ; analyse de la V0. */
    @Test
    void lAgenceRefuseOuAccepteEtAnalyseLaV0() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String brandOrg = org(admin, "Marque Olive", "MARQUE");
        String agA = org(admin, "Agence Alpha", "AGENCE_MARKETING"), agB = org(admin, "Agence Beta", "AGENCE_MARKETING");
        String brand = account(admin, "marque@figue.tn", "MARQUE", brandOrg);
        String alpha = account(admin, "agence@alpha.tn", "AGENCE_MARKETING", agA);
        String beta = account(admin, "agence@beta.tn", "AGENCE_MARKETING", agB);
        String id = read(create(admin, brand, "{\"title\":\"Huile d'olive\",\"product\":\"Huile vierge extra\"}")).get("id").asString();
        send("PUT", "/api/demandes/" + id + "/v0", brand, "{\"body\":\"Un grand-père récolte les olives avec sa petite-fille au lever du soleil.\"}").andExpect(status().isOk());
        send("POST", "/api/demandes/" + id + "/envoyer", brand, "{\"agencyId\":\"" + agA + "\"}").andExpect(status().isOk());

        // La marque ne répond pas à la place de l'agence ; une autre agence ne voit rien
        send("POST", "/api/demandes/" + id + "/accepter", brand, null).andExpect(status().isForbidden());
        send("POST", "/api/demandes/" + id + "/accepter", beta, null).andExpect(status().isNotFound());
        JsonNode seen = read(send("GET", "/api/demandes/" + id, alpha, null));
        assertThat(seen.get("canRespond").asBoolean()).isTrue();
        assertThat(seen.get("canAnalyse").asBoolean()).isTrue();

        // Refus sans motif : refusé ; avec motif : la demande revient en brouillon chez la marque, notifiée
        send("POST", "/api/demandes/" + id + "/refuser", alpha, "{\"reason\":\"\"}").andExpect(status().isBadRequest());
        JsonNode back = read(send("POST", "/api/demandes/" + id + "/refuser", alpha, "{\"reason\":\"Pas de place avant mars\"}").andExpect(status().isOk()));
        assertThat(back.get("status").asString()).isEqualTo("BROUILLON");
        send("GET", "/api/demandes/" + id, alpha, null).andExpect(status().isNotFound());
        JsonNode mine = read(send("GET", "/api/demandes/" + id, brand, null));
        assertThat(mine.get("canEdit").asBoolean()).isTrue();
        assertThat(mine.get("events").get(0).get("message").asString()).contains("Pas de place avant mars");
        assertThat(read(send("GET", "/api/me/notifications", brand, null)).get("items").toString()).contains("Demande refusée");

        // Renvoi à une autre agence, qui analyse puis accepte
        send("POST", "/api/demandes/" + id + "/envoyer", brand, "{\"agencyId\":\"" + agB + "\"}").andExpect(status().isOk());
        send("POST", "/api/demandes/" + id + "/analyse", brand, null).andExpect(status().isForbidden());
        JsonNode an = read(send("POST", "/api/demandes/" + id + "/analyse", beta, null).andExpect(status().isOk())).get("analysis");
        assertThat(an.get("summary").asString()).isNotBlank();
        assertThat(an.get("source").asString()).isIn("IA", "REGLES");
        assertThat(an.get("missing").toString()).contains("cible").doesNotContainIgnoringCase("budget");
        assertThat(an.get("questions").size()).isPositive();
        JsonNode ok = read(send("POST", "/api/demandes/" + id + "/accepter", beta, null).andExpect(status().isOk()));
        assertThat(ok.get("status").asString()).isEqualTo("V1_EN_COURS");
        assertThat(ok.get("canRespond").asBoolean()).isFalse();
        send("POST", "/api/demandes/" + id + "/accepter", beta, null).andExpect(status().isBadRequest());
        assertThat(read(send("GET", "/api/me/notifications", brand, null)).get("items").toString()).contains("Demande acceptée");
        // La marque ne peut plus annuler une demande acceptée
        send("POST", "/api/demandes/" + id + "/annuler", brand, null).andExpect(status().isBadRequest());
    }

    /** Sprint 3 · T-161 : V1 livrée, révision avec commentaire (V1.1), validation, choix de la boîte de production. */
    @Test
    void laV1EstLivreeReviseeValideePuisConfieeALaProduction() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String brandOrg = org(admin, "Marque Datte", "MARQUE"), agOrg = org(admin, "Agence Gamma", "AGENCE_MARKETING");
        String prodOrg = org(admin, "Prod Delta", "BOITE_PROD"), otherProd = org(admin, "Prod Epsilon", "BOITE_PROD");
        String brand = account(admin, "marque@datte.tn", "MARQUE", brandOrg);
        String agency = account(admin, "agence@gamma.tn", "AGENCE_MARKETING", agOrg);
        String prod = account(admin, "prod@delta.tn", "BOITE_PROD", prodOrg);
        String prod2 = account(admin, "prod@epsilon.tn", "BOITE_PROD", otherProd);
        String id = read(create(admin, brand, prod, "{\"title\":\"Dattes de Tozeur\"}")).get("id").asString();
        send("PUT", "/api/demandes/" + id + "/v0", brand, "{\"body\":\"Une caravane au coucher du soleil.\"}").andExpect(status().isOk());
        send("POST", "/api/demandes/" + id + "/envoyer", brand, "{\"agencyId\":\"" + agOrg + "\"}").andExpect(status().isOk());

        // Pas de V1 avant d'avoir accepté
        send("PUT", "/api/demandes/" + id + "/v1", agency, "{\"body\":\"x\"}").andExpect(status().isBadRequest());
        send("POST", "/api/demandes/" + id + "/accepter", agency, null).andExpect(status().isOk());
        assertThat(read(send("GET", "/api/demandes/" + id, agency, null)).get("canEditV1").asBoolean()).isTrue();

        // Brouillon de V1 : invisible pour la marque, pas de livraison à vide, la marque n'écrit pas la V1
        send("POST", "/api/demandes/" + id + "/v1/livrer", agency, null).andExpect(status().isBadRequest());
        send("PUT", "/api/demandes/" + id + "/v1", brand, "{\"body\":\"x\"}").andExpect(status().isForbidden());
        send("PUT", "/api/demandes/" + id + "/v1", agency, "{\"body\":\"Concept : le désert raconte la datte, 30 secondes.\"}").andExpect(status().isOk());
        assertThat(read(send("GET", "/api/demandes/" + id, brand, null)).get("versions").toString()).doesNotContain("le désert raconte");

        JsonNode d1 = read(send("POST", "/api/demandes/" + id + "/v1/livrer", agency, null).andExpect(status().isOk()));
        assertThat(d1.get("status").asString()).isEqualTo("V1_LIVREE");
        JsonNode seen = read(send("GET", "/api/demandes/" + id, brand, null));
        assertThat(seen.get("versions").toString()).contains("le désert raconte");
        assertThat(seen.get("canReviewV1").asBoolean()).isTrue();
        assertThat(read(send("GET", "/api/me/notifications", brand, null)).get("items").toString()).contains("V1 livrée");

        // Révision : commentaire obligatoire ; V1 « à revoir », puis V1.1 reprend le texte
        send("POST", "/api/demandes/" + id + "/v1/revision", brand, "{\"comment\":\"\"}").andExpect(status().isBadRequest());
        send("POST", "/api/demandes/" + id + "/v1/revision", agency, "{\"comment\":\"x\"}").andExpect(status().isForbidden());
        JsonNode rev = read(send("POST", "/api/demandes/" + id + "/v1/revision", brand, "{\"comment\":\"Montrez la famille, pas seulement le désert\"}").andExpect(status().isOk()));
        assertThat(rev.get("status").asString()).isEqualTo("V1_EN_COURS");
        assertThat(read(send("GET", "/api/me/notifications", agency, null)).get("items").toString()).contains("révision demandée");
        JsonNode v11 = read(send("PUT", "/api/demandes/" + id + "/v1", agency, "{\"body\":\"Concept : une famille partage les dattes au coucher du soleil.\"}"));
        JsonNode last = v11.get("versions").get(v11.get("versions").size() - 1);
        assertThat(last.get("label").asString()).isEqualTo("V1.1");
        assertThat(v11.get("versions").toString()).contains("A_REVISER").contains("Montrez la famille");
        send("POST", "/api/demandes/" + id + "/v1/livrer", agency, null).andExpect(status().isOk());

        // Validation par la marque
        JsonNode val = read(send("POST", "/api/demandes/" + id + "/v1/valider", brand, null).andExpect(status().isOk()));
        assertThat(val.get("v1Validated").asBoolean()).isTrue();
        send("POST", "/api/demandes/" + id + "/v1/valider", brand, null).andExpect(status().isBadRequest());
        // Le producer mène le projet depuis sa création : la V2 démarre dès la V1 validée ; l'agence ne choisit plus de production
        assertThat(read(send("GET", "/api/demandes/" + id, agency, null)).get("canChooseProduction").asBoolean()).isFalse();
        JsonNode p = read(send("GET", "/api/demandes/" + id, prod, null).andExpect(status().isOk()));
        assertThat(p.get("status").asString()).isEqualTo("V2_EN_COURS");
        assertThat(p.get("productionName").asString()).isEqualTo("Prod Delta");
        assertThat(read(send("GET", "/api/demandes", prod, null)).size()).isEqualTo(1);
        send("GET", "/api/demandes/" + id, prod, null).andExpect(status().isOk());
        send("GET", "/api/demandes/" + id, prod2, null).andExpect(status().isNotFound());
        assertThat(read(send("GET", "/api/me/notifications", prod, null)).get("items").toString()).contains("À vous");
    }

    /** Synchronisation de l'équipe : la production et le réalisateur, rattachés tôt, suivent la publicité en lecture
     *  et voient la même étape que tout le monde ; chacun agit à son tour. */
    @Test
    void lEquipeRattacheeTotSuitLaPubliciteEnLecture() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String brandOrg = org(admin, "Marque Figue", "MARQUE"), agOrg = org(admin, "Agence Lambda", "AGENCE_MARKETING"), prodOrg = org(admin, "Prod Mu", "BOITE_PROD");
        String brand = account(admin, "sync.marque@exemple.tn", "MARQUE", brandOrg);
        String agency = account(admin, "sync.agence@exemple.tn", "AGENCE_MARKETING", agOrg);
        String prod = account(admin, "sync.prod@exemple.tn", "BOITE_PROD", prodOrg);
        send("POST", "/api/admin/agents", admin, "{\"email\":\"sync.real@exemple.tn\",\"firstName\":\"Rim\",\"lastName\":\"Real\",\"role\":\"REALISATEUR\",\"password\":\"Motdepasse-123\"}").andExpect(status().isCreated());
        String director = login("sync.real@exemple.tn", "Motdepasse-123"), did = userId(admin, "sync.real@exemple.tn");

        String id = read(create(admin, brand, "{\"title\":\"Huile Olive\"}")).get("id").asString();
        send("PUT", "/api/demandes/" + id + "/v0", brand, "{\"body\":\"Un verger au lever du jour.\"}");
        send("POST", "/api/demandes/" + id + "/envoyer", brand, "{\"agencyId\":\"" + agOrg + "\"}");
        // Pas de production avant l'acceptation
        send("POST", "/api/demandes/" + id + "/production", agency, "{\"productionId\":\"" + prodOrg + "\"}").andExpect(status().isBadRequest());
        send("POST", "/api/demandes/" + id + "/accepter", agency, null);

        // Production rattachée pendant la V1 : elle voit la demande, l'étape, mais ne saisit rien encore
        JsonNode early = read(send("POST", "/api/demandes/" + id + "/production", agency, "{\"productionId\":\"" + prodOrg + "\"}").andExpect(status().isOk()));
        assertThat(early.get("status").asString()).isEqualTo("V1_EN_COURS");
        JsonNode pv = read(send("GET", "/api/demandes/" + id, prod, null).andExpect(status().isOk()));
        assertThat(pv.get("nowWho").asString()).isEqualTo("Agence Lambda");
        assertThat(pv.get("nowWhat").asString()).contains("recommandation");
        assertThat(pv.get("canEditExpectations").asBoolean()).isFalse();
        assertThat(pv.get("canAttachTeam").asBoolean()).isTrue();
        assertThat(read(send("GET", "/api/me/notifications", prod, null)).get("items").toString()).contains("Publicité à venir");
        send("POST", "/api/demandes/" + id + "/personnages", prod, "{\"name\":\"Leila\"}").andExpect(status().isBadRequest());

        // Réalisateur rattaché tôt : il suit en lecture, même étape affichée
        send("PUT", "/api/demandes/" + id + "/equipe", agency, "{\"directorId\":\"" + did + "\"}").andExpect(status().isForbidden());
        send("PUT", "/api/demandes/" + id + "/equipe", prod, "{\"directorId\":\"" + did + "\"}").andExpect(status().isOk());
        JsonNode dv = read(send("GET", "/api/demandes/" + id, director, null).andExpect(status().isOk()));
        assertThat(dv.get("nowWho").asString()).isEqualTo("Agence Lambda");
        assertThat(dv.get("canEditV2").asBoolean()).isFalse();
        assertThat(read(send("GET", "/api/demandes", director, null)).size()).isEqualTo(1);
        assertThat(read(send("GET", "/api/me/notifications", director, null)).get("items").toString()).contains("Publicité à suivre");

        // V1 livrée puis validée : la V2 démarre seule puisque la production est déjà là
        send("PUT", "/api/demandes/" + id + "/v1", agency, "{\"body\":\"Concept : le verger.\"}");
        send("POST", "/api/demandes/" + id + "/v1/livrer", agency, null);
        assertThat(read(send("GET", "/api/demandes/" + id, director, null)).get("nowWho").asString()).isEqualTo("La marque");
        assertThat(read(send("GET", "/api/demandes/" + id, director, null)).get("versions").toString()).contains("le verger");
        JsonNode val = read(send("POST", "/api/demandes/" + id + "/v1/valider", brand, null).andExpect(status().isOk()));
        assertThat(val.get("status").asString()).isEqualTo("V2_EN_COURS");
        assertThat(val.get("nowWho").asString()).isEqualTo("Rim Real");
        assertThat(read(send("GET", "/api/me/notifications", prod, null)).get("items").toString()).contains("À vous");
        // Le réalisateur n'écrit la V2 qu'une fois les attentes transmises
        send("PUT", "/api/demandes/" + id + "/v2", director, "{\"body\":\"x\"}").andExpect(status().isBadRequest());
        send("POST", "/api/demandes/" + id + "/personnages", prod, "{\"name\":\"Leila\"}").andExpect(status().isOk());
        send("POST", "/api/demandes/" + id + "/transmettre", prod, "{\"directorId\":\"" + did + "\"}").andExpect(status().isOk());
        JsonNode go = read(send("GET", "/api/demandes/" + id, director, null));
        assertThat(go.get("canEditV2").asBoolean()).isTrue();
        assertThat(go.get("nowWho").asString()).isEqualTo("Rim Real");
        // Plus de changement de production une fois la V2 commencée
        send("POST", "/api/demandes/" + id + "/production", agency, "{\"productionId\":\"" + prodOrg + "\"}").andExpect(status().isBadRequest());
    }

    /** Sprint 3 · T-162 : la production saisit les attentes par personnage et les transmet au réalisateur et au 1er AD. */
    @Test
    void laProductionSaisitLesAttentesEtLesTransmetAuRealisateur() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String brandOrg = org(admin, "Marque Jasmin", "MARQUE"), agOrg = org(admin, "Agence Zeta", "AGENCE_MARKETING"), prodOrg = org(admin, "Prod Eta", "BOITE_PROD");
        String brand = account(admin, "marque@jasmin.tn", "MARQUE", brandOrg);
        String agency = account(admin, "agence@zeta.tn", "AGENCE_MARKETING", agOrg);
        String prod = account(admin, "prod@eta.tn", "BOITE_PROD", prodOrg);
        send("POST", "/api/admin/agents", admin, "{\"email\":\"real@eta.tn\",\"firstName\":\"Nadia\",\"lastName\":\"Real\",\"role\":\"REALISATEUR\",\"password\":\"Motdepasse-123\"}").andExpect(status().isCreated());
        send("POST", "/api/admin/agents", admin, "{\"email\":\"ad@eta.tn\",\"firstName\":\"Omar\",\"lastName\":\"Assistant\",\"role\":\"REALISATEUR\",\"password\":\"Motdepasse-123\"}").andExpect(status().isCreated());
        send("POST", "/api/admin/agents", admin, "{\"email\":\"autre@eta.tn\",\"firstName\":\"Sami\",\"lastName\":\"Autre\",\"role\":\"REALISATEUR\",\"password\":\"Motdepasse-123\"}").andExpect(status().isCreated());
        String director = login("real@eta.tn", "Motdepasse-123"), firstAd = login("ad@eta.tn", "Motdepasse-123"), other = login("autre@eta.tn", "Motdepasse-123");

        String id = read(create(admin, brand, prod, "{\"title\":\"Parfum Jasmin\"}")).get("id").asString();
        send("POST", "/api/demandes/" + id + "/invitations", prod, "{\"email\":\"agence@zeta.tn\",\"kind\":\"AGENCE_MARKETING\"}").andExpect(status().isOk());
        send("PUT", "/api/demandes/" + id + "/v0", brand, "{\"body\":\"Une femme marche dans la médina.\"}");
        send("POST", "/api/demandes/" + id + "/envoyer", brand, "{\"agencyId\":\"" + agOrg + "\"}");
        send("POST", "/api/demandes/" + id + "/accepter", agency, null);
        // Pas d'attentes avant la V1 validée
        send("POST", "/api/demandes/" + id + "/personnages", prod, "{\"name\":\"Leila\"}").andExpect(status().isBadRequest());
        send("PUT", "/api/demandes/" + id + "/v1", agency, "{\"body\":\"Concept : la médina au petit matin.\"}");
        send("POST", "/api/demandes/" + id + "/v1/livrer", agency, null);
        send("POST", "/api/demandes/" + id + "/v1/valider", brand, null).andExpect(status().isOk());

        // Saisie : réservée à la production ; nom obligatoire
        assertThat(read(send("GET", "/api/demandes/" + id, prod, null)).get("canEditExpectations").asBoolean()).isTrue();
        send("POST", "/api/demandes/" + id + "/personnages", agency, "{\"name\":\"X\"}").andExpect(status().isForbidden());
        send("POST", "/api/demandes/" + id + "/personnages", prod, "{\"name\":\"\"}").andExpect(status().isBadRequest());
        // Pas de transmission sans personnage
        send("POST", "/api/demandes/" + id + "/transmettre", prod, "{\"directorId\":\"" + userId(admin, "real@eta.tn") + "\"}").andExpect(status().isBadRequest());
        JsonNode c = read(send("POST", "/api/demandes/" + id + "/personnages", prod,
                "{\"name\":\"Leila\",\"story\":\"Elle traverse la médina\",\"brandWish\":\"Femme de 30 à 40 ans, élégante, naturelle\",\"agencyWish\":\"Regard franc, pas de mannequin\"}").andExpect(status().isOk()));
        String cid = c.get("characters").get(0).get("id").asString();
        send("PUT", "/api/demandes/" + id + "/personnages/" + cid, prod, "{\"name\":\"Leila\",\"brandWish\":\"Femme de 30 à 40 ans\",\"agencyWish\":\"Regard franc, pas de mannequin\",\"notes\":\"Tournage un samedi\"}").andExpect(status().isOk());
        String tmp = read(send("POST", "/api/demandes/" + id + "/personnages", prod, "{\"name\":\"Passant\"}")).get("characters").get(1).get("id").asString();
        assertThat(read(send("DELETE", "/api/demandes/" + id + "/personnages/" + tmp, prod, null)).get("characters").size()).isEqualTo(1);

        // La marque et l'agence voient les attentes ; seule la production liste les réalisateurs
        assertThat(read(send("GET", "/api/demandes/" + id, brand, null)).get("characters").toString()).contains("Femme de 30 à 40 ans").contains("Tournage un samedi");
        send("GET", "/api/demandes/realisateurs", brand, null).andExpect(status().isForbidden());
        assertThat(read(send("GET", "/api/demandes/realisateurs", prod, null)).toString()).contains("Nadia Real");

        // Réalisateur avant transmission : ne voit rien. Même personne en 1er AD : refusé.
        send("GET", "/api/demandes/" + id, director, null).andExpect(status().isNotFound());
        String did = userId(admin, "real@eta.tn"), aid = userId(admin, "ad@eta.tn");
        send("POST", "/api/demandes/" + id + "/transmettre", prod, "{\"directorId\":\"" + did + "\",\"firstAdId\":\"" + did + "\"}").andExpect(status().isBadRequest());
        JsonNode t = read(send("POST", "/api/demandes/" + id + "/transmettre", prod, "{\"directorId\":\"" + did + "\",\"firstAdId\":\"" + aid + "\"}").andExpect(status().isOk()));
        assertThat(t.get("directorName").asString()).isEqualTo("Nadia Real");
        assertThat(t.get("firstAdName").asString()).isEqualTo("Omar Assistant");
        assertThat(read(send("GET", "/api/demandes", director, null)).size()).isEqualTo(1);
        assertThat(read(send("GET", "/api/demandes", firstAd, null)).size()).isEqualTo(1);
        JsonNode seen = read(send("GET", "/api/demandes/" + id, director, null).andExpect(status().isOk()));
        assertThat(seen.get("characters").get(0).get("agencyWish").asString()).contains("Regard franc");
        assertThat(seen.get("canEditExpectations").asBoolean()).isFalse();
        send("POST", "/api/demandes/" + id + "/personnages", director, "{\"name\":\"X\"}").andExpect(status().isForbidden());
        send("GET", "/api/demandes/" + id, other, null).andExpect(status().isNotFound());
        assertThat(read(send("GET", "/api/me/notifications", director, null)).get("items").toString()).contains("nouvelle publicité");
    }

    /** Sans réalisateur ni 1er AD : la boîte de production écrit la V2 elle-même et la publie ; le casting est lancé. */
    @Test
    void sansRealisateurLaProductionEcritEtPublieLaV2() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String brandOrg = org(admin, "Marque Nu", "MARQUE"), agOrg = org(admin, "Agence Xi", "AGENCE_MARKETING"), prodOrg = org(admin, "Prod Omicron", "BOITE_PROD");
        String brand = account(admin, "solo.marque@exemple.tn", "MARQUE", brandOrg);
        String agency = account(admin, "solo.agence@exemple.tn", "AGENCE_MARKETING", agOrg);
        String prod = account(admin, "solo.prod@exemple.tn", "BOITE_PROD", prodOrg);
        String id = read(create(admin, brand, prod, "{\"title\":\"Thé Solo\"}")).get("id").asString();
        send("PUT", "/api/demandes/" + id + "/v0", brand, "{\"body\":\"Une tasse de thé au souk.\"}");
        send("POST", "/api/demandes/" + id + "/envoyer", brand, "{\"agencyId\":\"" + agOrg + "\"}");
        send("POST", "/api/demandes/" + id + "/accepter", agency, null);
        send("PUT", "/api/demandes/" + id + "/v1", agency, "{\"body\":\"Concept : le thé partagé.\"}");
        send("POST", "/api/demandes/" + id + "/v1/livrer", agency, null);
        send("POST", "/api/demandes/" + id + "/v1/valider", brand, null).andExpect(status().isOk());

        // Aucun réalisateur : la production a la main sur la V2, sans transmission d'attentes
        JsonNode d = read(send("GET", "/api/demandes/" + id, prod, null));
        assertThat(d.get("canEditV2").asBoolean()).isTrue();
        assertThat(d.get("nowWhat").asString()).contains("rôles à caster");
        send("PUT", "/api/demandes/" + id + "/v2", agency, "{\"body\":\"x\"}").andExpect(status().isForbidden());
        send("PUT", "/api/demandes/" + id + "/v2", prod, "{\"body\":\"V2 : deux plans au souk, 20 secondes.\"}").andExpect(status().isOk());
        send("POST", "/api/demandes/" + id + "/roles", prod, "{\"name\":\"Le vendeur de thé\",\"intention\":\"Un homme chaleureux qui offre le thé comme on offre son temps.\",\"importance\":\"PRINCIPAL\"}").andExpect(status().isOk());
        JsonNode pub = read(send("POST", "/api/demandes/" + id + "/v2/publier", prod, null).andExpect(status().isOk()));
        assertThat(pub.get("status").asString()).isEqualTo("CASTING");
        String projectId = pub.get("projectId").asString();
        JsonNode roles = read(send("GET", "/api/projects/" + projectId + "/roles", prod, null).andExpect(status().isOk()));
        assertThat(roles.toString()).contains("Le vendeur de thé").contains("offre le thé");
    }

    /** Sprint 4 · T-163 : le réalisateur écrit la V2 (scènes, fiches de rôle) et la publie : projet de casting et rôles créés. */
    @Test
    void leRealisateurPublieLaV2EtLesRolesSontCrees() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String brandOrg = org(admin, "Marque Sel", "MARQUE"), agOrg = org(admin, "Agence Iota", "AGENCE_MARKETING"), prodOrg = org(admin, "Prod Kappa", "BOITE_PROD");
        String brand = account(admin, "marque@sel.tn", "MARQUE", brandOrg);
        String agency = account(admin, "agence@iota.tn", "AGENCE_MARKETING", agOrg);
        String prod = account(admin, "prod@kappa.tn", "BOITE_PROD", prodOrg);
        send("POST", "/api/admin/agents", admin, "{\"email\":\"real@kappa.tn\",\"firstName\":\"Rim\",\"lastName\":\"Real\",\"role\":\"REALISATEUR\",\"password\":\"Motdepasse-123\"}").andExpect(status().isCreated());
        send("POST", "/api/admin/agents", admin, "{\"email\":\"ad@kappa.tn\",\"firstName\":\"Ali\",\"lastName\":\"AD\",\"role\":\"REALISATEUR\",\"password\":\"Motdepasse-123\"}").andExpect(status().isCreated());
        String director = login("real@kappa.tn", "Motdepasse-123"), firstAd = login("ad@kappa.tn", "Motdepasse-123");

        String id = read(create(admin, brand, prod, "{\"title\":\"Sel de Sfax\"}")).get("id").asString();
        send("PUT", "/api/demandes/" + id + "/v0", brand, "{\"body\":\"Les salines au lever du jour.\"}");
        send("POST", "/api/demandes/" + id + "/envoyer", brand, "{\"agencyId\":\"" + agOrg + "\"}");
        send("POST", "/api/demandes/" + id + "/accepter", agency, null);
        send("PUT", "/api/demandes/" + id + "/v1", agency, "{\"body\":\"Concept : un saunier et sa fille.\"}");
        send("POST", "/api/demandes/" + id + "/v1/livrer", agency, null);
        send("POST", "/api/demandes/" + id + "/v1/valider", brand, null).andExpect(status().isOk());
        String cid = read(send("POST", "/api/demandes/" + id + "/personnages", prod, "{\"name\":\"Le saunier\",\"brandWish\":\"Homme de 50 à 60 ans, mains marquées\"}")).get("characters").get(0).get("id").asString();
        send("POST", "/api/demandes/" + id + "/transmettre", prod, "{\"directorId\":\"" + userId(admin, "real@kappa.tn") + "\",\"firstAdId\":\"" + userId(admin, "ad@kappa.tn") + "\"}").andExpect(status().isOk());

        // Seuls le réalisateur et le 1er AD écrivent la V2
        assertThat(read(send("GET", "/api/demandes/" + id, director, null)).get("canEditV2").asBoolean()).isTrue();
        send("PUT", "/api/demandes/" + id + "/v2", prod, "{\"body\":\"x\"}").andExpect(status().isForbidden());
        send("PUT", "/api/demandes/" + id + "/v2", director, "{\"body\":\"V2 : trois plans, lumière rasante, 30 secondes.\"}").andExpect(status().isOk());
        send("POST", "/api/demandes/" + id + "/scenes", firstAd, "{\"title\":\"Scène 1 · Les salines\",\"description\":\"Plan large, le saunier ramasse le sel.\"}").andExpect(status().isOk());
        // Publication impossible sans fiche de rôle, puis sans intention
        send("POST", "/api/demandes/" + id + "/v2/publier", director, null).andExpect(status().isBadRequest());
        send("POST", "/api/demandes/" + id + "/roles", director, "{\"name\":\"Le saunier\",\"gender\":\"Autre\"}").andExpect(status().isBadRequest());
        send("POST", "/api/demandes/" + id + "/roles", director, "{\"name\":\"Le saunier\",\"minAge\":60,\"maxAge\":50}").andExpect(status().isBadRequest());
        JsonNode withRole = read(send("POST", "/api/demandes/" + id + "/roles", director,
                "{\"characterId\":\"" + cid + "\",\"name\":\"Le saunier\",\"gender\":\"Homme\",\"minAge\":50,\"maxAge\":65,\"appearance\":\"Mains marquées, peau tannée\",\"importance\":\"PRINCIPAL\"}").andExpect(status().isOk()));
        String rid = withRole.get("roles").get(0).get("id").asString();
        assertThat(withRole.get("roles").get(0).get("characterName").asString()).isEqualTo("Le saunier");
        // Les brouillons de V2 ne sont pas visibles de la marque
        JsonNode brandSees = read(send("GET", "/api/demandes/" + id, brand, null));
        assertThat(brandSees.get("roles").size()).isZero();
        assertThat(brandSees.get("versions").toString()).doesNotContain("lumière rasante");
        send("POST", "/api/demandes/" + id + "/v2/publier", director, null).andExpect(status().isBadRequest());
        send("PUT", "/api/demandes/" + id + "/roles/" + rid, director,
                "{\"characterId\":\"" + cid + "\",\"name\":\"Le saunier\",\"intention\":\"Un homme fier de son travail, silencieux, dont le regard dit la fatigue et la tendresse.\",\"gender\":\"Homme\",\"minAge\":50,\"maxAge\":65,\"appearance\":\"Mains marquées, peau tannée\",\"importance\":\"PRINCIPAL\"}").andExpect(status().isOk());
        send("POST", "/api/demandes/" + id + "/roles", director, "{\"name\":\"Ouvriers des salines\",\"intention\":\"Silhouettes au travail à l'arrière-plan.\",\"importance\":\"FIGURATION\"}").andExpect(status().isOk());

        // Publication : V2 figée, statut casting, projet et rôles créés
        JsonNode pub = read(send("POST", "/api/demandes/" + id + "/v2/publier", director, null).andExpect(status().isOk()));
        assertThat(pub.get("status").asString()).isEqualTo("CASTING");
        String projectId = pub.get("projectId").asString();
        assertThat(pub.get("roles").get(0).get("castingRoleId").isNull()).isFalse();
        send("PUT", "/api/demandes/" + id + "/v2", director, "{\"body\":\"y\"}").andExpect(status().isBadRequest());
        JsonNode roles = read(send("GET", "/api/projects/" + projectId + "/roles", director, null).andExpect(status().isOk()));
        assertThat(roles.size()).isEqualTo(2);
        assertThat(roles.toString()).contains("fier de son travail").contains("FIGURATION");
        // 1er AD et production ont accès au projet ; la marque voit la V2 et les rôles, sans le projet
        send("GET", "/api/projects/" + projectId + "/roles", firstAd, null).andExpect(status().isOk());
        send("GET", "/api/projects/" + projectId + "/roles", prod, null).andExpect(status().isOk());
        JsonNode after = read(send("GET", "/api/demandes/" + id, brand, null));
        assertThat(after.get("roles").size()).isEqualTo(2);
        assertThat(after.get("versions").toString()).contains("lumière rasante");
        assertThat(after.get("projectId").asString()).isEqualTo(projectId); // la marque rejoint la room du projet
        assertThat(read(send("GET", "/api/me/notifications", brand, null)).get("items").toString()).contains("Casting lancé");
    }

    /** Une V0 ou une V1 peut être une présentation Canva : lien https seul suffit ; l'analyse signale qu'il faut aussi le PDF. */
    @Test
    void uneVersionPeutEtreUnePresentationCanva() throws Exception {
        String admin = login("ahmed@casting.com", "password123");
        String brandOrg = org(admin, "Marque Canva", "MARQUE"), agOrg = org(admin, "Agence Canva", "AGENCE_MARKETING");
        String brand = account(admin, "marque@canva-test.tn", "MARQUE", brandOrg);
        String agency = account(admin, "agence@canva-test.tn", "AGENCE_MARKETING", agOrg);
        String id = read(create(admin, brand, "{\"title\":\"Pub Canva\"}")).get("id").asString();
        send("PUT", "/api/demandes/" + id + "/v0", brand, "{\"body\":null,\"link\":\"http://www.canva.com/design/x/view\"}").andExpect(status().isBadRequest());
        send("PUT", "/api/demandes/" + id + "/v0", brand, "{\"body\":null,\"link\":\"javascript:alert(1)\"}").andExpect(status().isBadRequest());
        JsonNode d = read(send("PUT", "/api/demandes/" + id + "/v0", brand, "{\"body\":null,\"link\":\"https://www.canva.com/design/DAF123/view\"}").andExpect(status().isOk()));
        assertThat(d.get("versions").get(0).get("linkUrl").asString()).isEqualTo("https://www.canva.com/design/DAF123/view");
        // Le lien seul suffit pour envoyer la V0
        send("POST", "/api/demandes/" + id + "/envoyer", brand, "{\"agencyId\":\"" + agOrg + "\"}").andExpect(status().isOk());
        assertThat(read(send("GET", "/api/demandes", brand, null)).get(0).get("hasV0").asBoolean()).isTrue();
        JsonNode an = read(send("POST", "/api/demandes/" + id + "/analyse", agency, null).andExpect(status().isOk())).get("analysis");
        assertThat(an.get("missing").get(0).asString()).contains("présentation Canva").contains("PDF");
        send("POST", "/api/demandes/" + id + "/accepter", agency, null).andExpect(status().isOk());
        send("PUT", "/api/demandes/" + id + "/v1", agency, "{\"link\":\"https://www.canva.com/design/V1/view\"}").andExpect(status().isOk());
        JsonNode v1 = read(send("POST", "/api/demandes/" + id + "/v1/livrer", agency, null).andExpect(status().isOk()));
        assertThat(v1.get("versions").toString()).contains("https://www.canva.com/design/V1/view");
        // La V1.1 reprend le lien de la V1 renvoyée en révision
        send("POST", "/api/demandes/" + id + "/v1/revision", brand, "{\"comment\":\"Plus court\"}").andExpect(status().isOk());
        JsonNode v11 = read(send("PUT", "/api/demandes/" + id + "/v1", agency, "{\"body\":\"Version courte\",\"link\":\"https://www.canva.com/design/V1/view\"}"));
        JsonNode last = v11.get("versions").get(v11.get("versions").size() - 1);
        assertThat(last.get("label").asString()).isEqualTo("V1.1");
        assertThat(last.get("linkUrl").asString()).isEqualTo("https://www.canva.com/design/V1/view");
    }

    private String userId(String admin, String email) throws Exception {
        JsonNode list = read(send("GET", "/api/admin/users", admin, null));
        JsonNode arr = list.isArray() ? list : list.get("content");
        for (JsonNode u : arr) if (email.equals(u.get("email").asString())) return u.get("id").asString();
        throw new IllegalStateException("utilisateur introuvable : " + email);
    }
}
