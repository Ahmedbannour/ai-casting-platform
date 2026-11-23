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
}
