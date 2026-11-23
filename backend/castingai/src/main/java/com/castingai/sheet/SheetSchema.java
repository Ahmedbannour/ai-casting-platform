package com.castingai.sheet;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * P-083 / P-084 · Plan du dossier unique du film : sept chapitres, chacun avec son rédacteur principal.
 * Côtés : PROD (producer, assistante avec PROJETS), MARQUE, AGENCE, REAL (réalisateur et 1er AD).
 */
public final class SheetSchema {

    private SheetSchema() {}

    public enum Kind { TEXT, LONG, DATE }

    public record Field(String key, String stage, String label, String hint, Kind kind, boolean required, String column) {}

    public record Stage(String key, int num, String title, String owner, String intro, Set<String> sides, boolean auto) {}

    /**
     * Le dossier du film, dans l'ordre d'une production publicitaire : brief → recommandation → préparation → casting.
     * Chaque chapitre a son rédacteur principal ; le producer, chef d'orchestre, peut tout compléter.
     */
    public static final List<Stage> STAGES = List.of(
        new Stage("brief", 1, "Le brief", "Marque", "Ce que la publicité doit faire, pour qui, avec quel message.", Set.of("MARQUE", "PROD"), false),
        new Stage("diffusion", 2, "La diffusion", "Marque", "Quand et où le film sera vu, et en quels formats.", Set.of("MARQUE", "PROD"), false),
        new Stage("concept", 3, "La recommandation créative", "Agence marketing", "L'idée créative qui répond au brief, validée par la marque.", Set.of("AGENCE", "PROD"), false),
        new Stage("realisation", 4, "La note d'intention", "Réalisation", "Comment le film sera filmé et monté.", Set.of("REAL", "PROD"), false),
        new Stage("production", 5, "La production", "Producer", "Où, quand et avec qui on tourne.", Set.of("PROD", "REAL"), false),
        new Stage("roles", 6, "Les rôles à caster", "Réalisation", "Un rôle par personnage : l'intention guide les propositions d'acteurs.", Set.of("REAL", "PROD"), false),
        new Stage("casting", 7, "Le casting", "Toute l'équipe", "Le choix des acteurs, rôle par rôle, dans la room.", Set.of(), true)
    );

    public static final List<Field> FIELDS = List.of(
        new Field("titre", "brief", "Titre du projet", "Ex. Lancement printemps 2027", Kind.TEXT, true, "title"),
        new Field("produit", "brief", "Produit ou service", "Ce que la publicité fait vendre ou connaître", Kind.TEXT, true, "product"),
        new Field("objectif", "brief", "Objectif", "Faire connaître, faire acheter, changer une image…", Kind.LONG, true, "objective"),
        new Field("cible", "brief", "Cible", "À qui la publicité s'adresse", Kind.LONG, true, "target"),
        new Field("message", "brief", "Message clé", "La phrase qu'on doit retenir", Kind.LONG, true, "key_message"),
        new Field("ton", "brief", "Ton souhaité", "Chaleureux, drôle, premium…", Kind.TEXT, false, null),
        new Field("contraintes", "brief", "Contraintes de la marque", "Logo, mentions légales, produits à montrer, interdits", Kind.LONG, false, null),

        new Field("diffusion", "diffusion", "Date de diffusion", "Première diffusion prévue", Kind.DATE, true, "air_date"),
        new Field("duree", "diffusion", "Durée du film", "Ex. 30 s, puis une version 15 s", Kind.TEXT, true, null),
        new Field("supports", "diffusion", "Supports de diffusion", "Télévision, réseaux sociaux, cinéma, affichage…", Kind.TEXT, true, null),

        new Field("idee", "concept", "L'idée", "Le concept en quelques phrases", Kind.LONG, true, null),
        new Field("accroche", "concept", "Accroche ou signature", "Le slogan de fin", Kind.TEXT, false, null),
        new Field("deroule", "concept", "Déroulé du film", "Ce qu'on voit, du début à la fin", Kind.LONG, true, null),
        new Field("references", "concept", "Références", "Films, photos, musiques qui donnent le ton", Kind.LONG, false, null),

        new Field("intention", "realisation", "Note d'intention", "Ce que le film doit faire ressentir", Kind.LONG, true, null),
        new Field("image", "realisation", "Image et lumière", "Cadre, couleurs, lumière", Kind.LONG, false, null),
        new Field("rythme", "realisation", "Rythme et montage", "Plans longs, montage nerveux, musique…", Kind.LONG, false, null),
        new Field("format", "realisation", "Format", "16:9, vertical 9:16, versions courtes…", Kind.TEXT, false, null),

        new Field("lieux", "production", "Lieux de tournage", "Villes, décors, intérieur ou extérieur", Kind.LONG, true, null),
        new Field("dates_tournage", "production", "Dates de tournage", "Ex. du 12 au 14 mars 2027", Kind.TEXT, true, null),
        new Field("planning", "production", "Planning", "Repérages, PPM, tournage, montage, livraison", Kind.LONG, false, null),
        new Field("equipe_tech", "production", "Équipe technique", "Chef opérateur, décorateur, costumière…", Kind.LONG, false, null)
    );

    public static final Map<String, Field> BY_KEY = FIELDS.stream().collect(Collectors.toMap(Field::key, Function.identity()));
    public static final Map<String, Stage> STAGE_BY_KEY = STAGES.stream().collect(Collectors.toMap(Stage::key, Function.identity()));

    public static List<Field> fieldsOf(String stage) { return FIELDS.stream().filter(f -> f.stage().equals(stage)).toList(); }
}
