package com.castingai.service;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFShape;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
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
}
