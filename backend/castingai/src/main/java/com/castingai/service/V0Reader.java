package com.castingai.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.apache.poi.xslf.usermodel.XSLFGroupShape;
import org.apache.poi.xslf.usermodel.XSLFTable;
import org.apache.poi.xslf.usermodel.XSLFTableRow;
import org.apache.poi.xslf.usermodel.XSLFTableCell;
import org.apache.poi.xslf.usermodel.XSLFNotes;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

/**
 * T-160 · Lit le texte d'un fichier de V0 pour l'analyse (PDF, Word .docx, PowerPoint .pptx, texte).
 * Les autres formats (images, Keynote, anciens .doc/.ppt) ne sont pas lus : l'analyse le signale.
 */
@Component
public class V0Reader {

    static final int MAX_CHARS = 12000;

    /** @return le texte lu, ou null si le format n'est pas lisible. */
    public String read(byte[] bytes, String fileName) {
        if (bytes == null || fileName == null) return null;
        String ext = fileName.contains(".") ? fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase() : "";
        try {
            String t = switch (ext) {
                case "pdf" -> { try (PDDocument d = Loader.loadPDF(bytes)) { yield new PDFTextStripper().getText(d); } }
                case "docx" -> { try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(bytes)); XWPFWordExtractor x = new XWPFWordExtractor(d)) { yield x.getText(); } }
                case "pptx" -> {
                    StringBuilder sb = new StringBuilder();
                    try (XMLSlideShow s = new XMLSlideShow(new ByteArrayInputStream(bytes))) {
                        for (XSLFSlide slide : s.getSlides()) {
                            for (XSLFShape sh : slide.getShapes()) if (sh instanceof XSLFTextShape ts) sb.append(ts.getText()).append('\n');
                            sb.append('\n');
                        }
                    }
                    yield sb.toString();
                }
                case "txt", "rtf" -> new String(bytes, StandardCharsets.UTF_8);
                default -> null;
            };
            if (t == null) return null;
            t = t.replaceAll("[ \\t\\x0B\\f\\r]+", " ").replaceAll("\\n\\s*\\n+", "\n\n").trim();
            return t.length() > MAX_CHARS ? t.substring(0, MAX_CHARS) : t;
        } catch (Exception e) {
            return null;
        }
    }

    /** P-087 · Texte complet pour l'agent de la fiche : jusqu'à 60 000 caractères, pages et diapositives séparées par « \f ». */
    public static final int FULL_CHARS = 60000;

    public String readFull(byte[] bytes, String fileName) {
        if (bytes == null || fileName == null) return null;
        String ext = fileName.contains(".") ? fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase() : "";
        try {
            String t = switch (ext) {
                case "pdf" -> {
                    try (PDDocument d = Loader.loadPDF(bytes)) {
                        PDFTextStripper st = new PDFTextStripper();
                        st.setSortByPosition(true);       // les présentations exportées gardent l'ordre de lecture
                        st.setPageEnd("\n\f\n");
                        yield st.getText(d);
                    }
                }
                case "docx" -> { try (XWPFDocument d = new XWPFDocument(new ByteArrayInputStream(bytes)); XWPFWordExtractor x = new XWPFWordExtractor(d)) { yield x.getText(); } }
                case "pptx" -> {
                    StringBuilder sb = new StringBuilder();
                    try (XMLSlideShow s = new XMLSlideShow(new ByteArrayInputStream(bytes))) {
                        for (XSLFSlide slide : s.getSlides()) {
                            for (XSLFShape sh : slide.getShapes()) shapeText(sh, sb);
                            XSLFNotes notes = slide.getNotes();
                            if (notes != null) for (XSLFShape sh : notes.getShapes()) if (sh instanceof XSLFTextShape ts && ts.getText() != null && ts.getText().length() > 3) sb.append("Notes : ").append(ts.getText()).append('\n');
                            sb.append("\n\f\n");
                        }
                    }
                    yield sb.toString();
                }
                case "txt", "rtf" -> new String(bytes, StandardCharsets.UTF_8);
                default -> null;
            };
            if (t == null) return null;
            t = t.replaceAll("[ \\t\\x0B\\r]+", " ").replaceAll("\\n[ ]*\\n[ \\n]*", "\n\n").trim();
            return t.length() > FULL_CHARS ? t.substring(0, FULL_CHARS) : t;
        } catch (Exception e) {
            return null;
        }
    }

    private static void shapeText(XSLFShape sh, StringBuilder sb) {
        if (sh instanceof XSLFTextShape ts) { String x = ts.getText(); if (x != null && !x.isBlank()) sb.append(x).append('\n'); }
        else if (sh instanceof XSLFGroupShape g) for (XSLFShape c : g.getShapes()) shapeText(c, sb);
        else if (sh instanceof XSLFTable tb) for (XSLFTableRow row : tb.getRows()) {
            StringBuilder line = new StringBuilder();
            for (XSLFTableCell c : row.getCells()) { String x = c.getText(); if (x != null && !x.isBlank()) line.append(line.length() > 0 ? " | " : "").append(x.trim()); }
            if (line.length() > 0) sb.append(line).append('\n');
        }
    }
}
