package com.castingai.sheet;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** P-083 · Lecture d'un brief sans IA, et liens refusés. */
public class SheetReadingTest {

    public static final String BRIEF = """
        BRIEF CRÉATIF — Huile Zitouna
        Produit : Huile d'olive extra vierge Zitouna, bouteille 75 cl
        Objectif : faire connaître la nouvelle bouteille et rassurer sur l'origine tunisienne
        Cible :
        Familles tunisiennes, 30 à 50 ans, qui cuisinent tous les jours
        Message clé : l'huile de nos grands-mères, dans une bouteille d'aujourd'hui
        Ton : chaleureux, familial, lumineux
        Durée : 30 secondes, puis une version 15 s
        Supports de diffusion : télévision nationale, Instagram, Facebook
        Date de diffusion : 15/03/2027
        Mentions obligatoires : logo en fin de film, « produit de Tunisie »
        """;

    @Test
    void lesRubriquesEtiqueteesSontLuesSansIA() {
        Map<String, String> v = SheetAi.rules(BRIEF);
        assertThat(v.get("produit")).contains("Zitouna");
        assertThat(v.get("objectif")).startsWith("faire connaître");
        assertThat(v.get("cible")).isEqualTo("Familles tunisiennes, 30 à 50 ans, qui cuisinent tous les jours");
        assertThat(v.get("message")).contains("grands-mères");
        assertThat(v.get("ton")).contains("chaleureux");
        assertThat(v.get("duree")).startsWith("30 secondes");
        assertThat(v.get("supports")).contains("Instagram");
        assertThat(v.get("diffusion")).isEqualTo("2027-03-15");
        assertThat(v.get("contraintes")).contains("logo");
    }

    @Test
    void lIANeDoitRienInventer() {
        assertThat(SheetAi.grounded("Familles tunisiennes qui cuisinent", BRIEF)).isTrue();
        assertThat(SheetAi.grounded("Jeunes sportifs urbains passionnés de football", BRIEF)).isFalse();
        assertThat(SheetAi.date("15 mars 2027")).isEqualTo("2027-03-15");
        assertThat(SheetAi.date("au printemps")).isNull();
    }

    @Test
    void lesLiensInternesOuNonChiffresSontRefuses() {
        assertThatThrownBy(() -> LinkReader.check("http://www.canva.com/design/x/view")).hasMessageContaining("https://");
        assertThatThrownBy(() -> LinkReader.check("https://localhost/x")).hasMessageContaining("interne");
        assertThatThrownBy(() -> LinkReader.check("https://127.0.0.1/x")).hasMessageContaining("interne");
        assertThatThrownBy(() -> LinkReader.check("https://192.168.1.10/x")).hasMessageContaining("interne");
        assertThat(LinkReader.isCanva(java.net.URI.create("https://www.canva.com/design/DAF/view"))).isTrue();
    }

    @Test
    void leTexteVisibleDUnePageEstExtrait() {
        String html = "<html><head><title>Brief</title><meta property=\"og:description\" content=\"Spot Zitouna\"><script>var x=1</script></head><body><h1>Cible</h1><p>Familles</p></body></html>";
        assertThat(LinkReader.tag(html, "title")).isEqualTo("Brief");
        assertThat(LinkReader.meta(html, "og:description")).isEqualTo("Spot Zitouna");
        assertThat(LinkReader.visibleText(html)).contains("Cible").contains("Familles").doesNotContain("var x");
    }

    @org.junit.jupiter.api.Test
    void lesDatesDeTournageDeviennentUnePeriode() {
        org.assertj.core.api.Assertions.assertThat(SheetAi.range("Du 12 au 14 mars 2027")).isEqualTo("2027-03-12/2027-03-14");
        org.assertj.core.api.Assertions.assertThat(SheetAi.range("12/03/2027 au 14/03/2027")).isEqualTo("2027-03-12/2027-03-14");
        org.assertj.core.api.Assertions.assertThat(SheetAi.range("du 30 mars au 2 avril 2027")).isEqualTo("2027-03-30/2027-04-02");
        org.assertj.core.api.Assertions.assertThat(SheetAi.range("le 5 mai 2027")).isEqualTo("2027-05-05/2027-05-05");
        org.assertj.core.api.Assertions.assertThat(SheetAi.range("fin mars, à confirmer")).isNull();
        org.assertj.core.api.Assertions.assertThat(SheetAi.normalize("dates_tournage", "fin mars, à confirmer")).isEqualTo("fin mars, à confirmer");
    }

    @Test
    void lAgentGardeCeQueLeDocumentDitEtEcarteLeReste() {
        String doc = " " + SheetAgent.plain("Proposition de réalisation. Série digitale Golden Coffee : 4 capsules de 71 secondes. "
                + "Décors : salle de réunion, villa. Ton : comique pur, sensible, absurde. Tournage de 2 jours en novembre 2026.") + " ";
        org.assertj.core.api.Assertions.assertThat(SheetAgent.clean("produit", "Golden Coffee", doc)).isEqualTo("Golden Coffee");
        org.assertj.core.api.Assertions.assertThat(SheetAgent.clean("cible", "Public général", doc)).isNull();
        org.assertj.core.api.Assertions.assertThat(SheetAgent.clean("contraintes", "Logo, mentions légales, produits à montrer, interdits", doc)).isNull();
        org.assertj.core.api.Assertions.assertThat(SheetAgent.clean("duree", "30 s", doc)).isNull();
        org.assertj.core.api.Assertions.assertThat(SheetAgent.clean("duree", "71 secondes", doc)).isEqualTo("71 secondes");
        org.assertj.core.api.Assertions.assertThat(SheetAgent.clean("lieux", "Salle de réunion, villa, plage", doc)).isEqualTo("Salle de réunion, villa");
        org.assertj.core.api.Assertions.assertThat(SheetAgent.clean("dates_tournage", "Jour 1 : salle de réunion", doc)).isNull();
        org.assertj.core.api.Assertions.assertThat(SheetAgent.clean("supports", "Salle de réunion, Villa, Série digitale", doc)).isEqualTo("Série digitale");
        org.assertj.core.api.Assertions.assertThat(SheetAgent.unloop("tache de café, tache de café, tache de café, villa")).isEqualTo("tache de café, villa");
        org.assertj.core.api.Assertions.assertThat(SheetAgent.keywords(doc)).containsEntry("supports", "Digital");
        org.assertj.core.api.Assertions.assertThat(SheetAgent.keywords(" " + SheetAgent.plain("Trois candidats ratés : Cinéma, Influenceur") + " ")).doesNotContainKey("supports");
        org.assertj.core.api.Assertions.assertThat(SheetAgent.keywords(" " + SheetAgent.plain("Diffusion prévue en télévision et au cinéma") + " ").get("supports")).isEqualTo("Télévision, Cinéma");
        org.assertj.core.api.Assertions.assertThat(SheetAgent.usefulNote("Facultatif, peut être négligé.", "villa")).isFalse();
        org.assertj.core.api.Assertions.assertThat(SheetAgent.usefulNote("Repérer la villa et la salle de réunion avec le chef opérateur.", "Lieux : salle de réunion, villa")).isTrue();
        org.assertj.core.api.Assertions.assertThat(SheetAgent.clean("intention", "La tache qui parle", doc + " tache parle ")).isNull();
    }

    @Test
    void lePlanningResteCoherentQuellesQueSoientLesDureesProposees() {
        java.time.LocalDate s = java.time.LocalDate.of(2027, 1, 11), e = java.time.LocalDate.of(2027, 1, 12), diff = java.time.LocalDate.of(2027, 2, 1);
        var plan = SheetAgent.schedule(s, e, diff, java.util.Map.of("Casting", 40, "Montage", 12), java.util.Set.of("Rappels de casting", "Déclinaisons réseaux sociaux"), java.util.Map.of());
        for (var st : plan) {
            var a = java.time.LocalDate.parse(st.debut());
            org.assertj.core.api.Assertions.assertThat(java.time.LocalDate.parse(st.fin())).isAfterOrEqualTo(a);
            if (!st.etape().equals("Tournage") && !st.etape().equals("Première diffusion"))
                org.assertj.core.api.Assertions.assertThat(a.getDayOfWeek().getValue()).as(st.etape()).isLessThan(6);
        }
        var byName = new java.util.HashMap<String, SheetAgent.Step>();
        plan.forEach(x -> byName.put(x.etape(), x));
        org.assertj.core.api.Assertions.assertThat(byName.get("Tournage").debut()).isEqualTo("2027-01-11");
        org.assertj.core.api.Assertions.assertThat(byName.get("Casting").fin()).isLessThan("2027-01-11");
        org.assertj.core.api.Assertions.assertThat(byName.get("Montage").debut()).isGreaterThan("2027-01-12");
        org.assertj.core.api.Assertions.assertThat(byName.get("Livraison des fichiers").fin()).isLessThan("2027-02-01");
        org.assertj.core.api.Assertions.assertThat(byName).containsKeys("Rappels de casting", "Déclinaisons réseaux sociaux");
        org.assertj.core.api.Assertions.assertThat(byName.get("Casting").debut()).isGreaterThanOrEqualTo("2026-11-01");   // durée bornée à 15 jours
    }
}
