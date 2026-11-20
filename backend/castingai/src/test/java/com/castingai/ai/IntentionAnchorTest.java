package com.castingai.ai;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** T-164 · L'explication cite toujours un vrai passage de l'intention du réalisateur, jamais un texte inventé. */
class IntentionAnchorTest {

    static final String INTENTION = "Une femme libre et sereine, qui s'arrête pour respirer le jasmin. Un instant rien que pour elle.";

    @Test
    void lExtraitExactEstGardeAvecLeTexteDuRealisateur() {
        assertThat(AiSearchServiceImpl.anchor(INTENTION, "« libre et SEREINE »", "calme")).isEqualTo("libre et sereine");
        assertThat(AiSearchServiceImpl.anchor(INTENTION, "un instant rien que pour elle.", null)).isEqualTo("Un instant rien que pour elle");
    }

    @Test
    void unExtraitInventeEstRemplaceParLaPhraseLaPlusProche() {
        String a = AiSearchServiceImpl.anchor(INTENTION, "respire profondément le parfum du jasmin", "elle sait se poser et respirer");
        assertThat(a).isEqualTo("qui s'arrête pour respirer le jasmin");
        assertThat(INTENTION).contains(a);
    }

    @Test
    void rienDeCommunRienDeCite() {
        assertThat(AiSearchServiceImpl.anchor(INTENTION, "cascadeur moto", "pilote")).isNull();
        assertThat(AiSearchServiceImpl.anchor(null, "x", "y")).isNull();
    }
}
