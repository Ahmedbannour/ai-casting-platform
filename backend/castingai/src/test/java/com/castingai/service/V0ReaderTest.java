package com.castingai.service;

import com.castingai.entity.AdRequest;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** T-160 · Lecture du texte des fichiers de V0 et points manquants vérifiés sans IA. */
class V0ReaderTest {

    final V0Reader reader = new V0Reader();

    @Test
    void litUnPdfEtUnWord() throws Exception {
        ByteArrayOutputStream pdf = new ByteArrayOutputStream();
        try (PDDocument d = new PDDocument()) {
            PDPage p = new PDPage(); d.addPage(p);
            try (PDPageContentStream c = new PDPageContentStream(d, p)) {
                c.beginText(); c.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12); c.newLineAtOffset(50, 700);
                c.showText("Une famille au petit dejeuner"); c.endText();
            }
            d.save(pdf);
        }
        assertThat(reader.read(pdf.toByteArray(), "v0.pdf")).contains("petit dejeuner");

        ByteArrayOutputStream docx = new ByteArrayOutputStream();
        try (XWPFDocument d = new XWPFDocument()) { d.createParagraph().createRun().setText("Le goût du verger"); d.write(docx); }
        assertThat(reader.read(docx.toByteArray(), "V0.DOCX")).contains("goût du verger");

        assertThat(reader.read(new byte[]{1, 2, 3}, "photo.jpg")).isNull();
        assertThat(reader.read(new byte[]{1, 2, 3}, "casse.pdf")).isNull();
    }

    @Test
    void reglesDesPointsManquants() {
        AdRequest r = new AdRequest();
        r.setTitle("Spot");
        List<String> m = V0Analyzer.rules(r, "court", null, "photo.jpg");
        assertThat(m).anyMatch(x -> x.startsWith("L'objectif")).anyMatch(x -> x.startsWith("La cible"))
                .anyMatch(x -> x.contains("photo.jpg")).anyMatch(x -> x.startsWith("La V0 est très courte"))
                .noneMatch(x -> x.toLowerCase().contains("budget"));
        assertThat(V0Analyzer.questionsFor(m)).hasSizeGreaterThanOrEqualTo(4);

        r.setObjective("Lancer"); r.setTarget("Familles"); r.setKeyMessage("Le soleil"); r.setAirDate(LocalDate.now().plusDays(30));
        assertThat(V0Analyzer.rules(r, "x".repeat(300), null, null)).isEmpty();
    }

    @Test
    void lesQuestionsGlisseesDansLeResumeEnSontSorties() {
        var sp = V0Analyzer.splitQuestions("Un moment chaleureux en famille. Le ton est doux. Les questions à poser à la marque sont : Quel décor ? Quels produits montrer ?");
        assertThat(sp.text()).isEqualTo("Un moment chaleureux en famille. Le ton est doux.");
        assertThat(sp.questions()).containsExactly("Quel décor ?", "Quels produits montrer ?");
        assertThat(V0Analyzer.splitQuestions("Rien à demander.").text()).isEqualTo("Rien à demander.");
    }
}
