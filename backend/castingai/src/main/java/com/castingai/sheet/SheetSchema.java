package com.castingai.sheet;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * P-083 · Plan de la fiche unique du projet : sept étapes, chacune avec son propriétaire.
 * Côtés : PROD (producer, assistante avec PROJETS), MARQUE, AGENCE, REAL (réalisateur et 1er AD).
 */
public final class SheetSchema {

    private SheetSchema() {}

    public enum Kind { TEXT, LONG, DATE }

    public record Field(String key, String stage, String label, String hint, Kind kind, boolean required, String column) {}

    public record Stage(String key, int num, String title, String owner, String intro, Set<String> sides, boolean auto) {}

    public static final List<Stage> STAGES = List.of(
        new Stage("identite", 1, "L'identité du projet", "Producer", "Ce qu'on fabrique, pour quand, et où ça sera vu.", Set.of("PROD"), false),
        new Stage("brief", 2, "Le brief de la marque", "Marque", "Ce que la publicité doit faire, pour qui, avec quel message.", Set.of("MARQUE"), false),
        new Stage("concept", 3, "Le concept", "Agence marketing", "L'idée créative qui répond au brief.", Set.of("AGENCE"), false),
        new Stage("production", 4, "La production", "Producer", "Où, quand et avec qui on tourne.", Set.of("PROD"), false),
        new Stage("realisation", 5, "L'intention de réalisation", "Réalisation", "Comment le film sera filmé et monté.", Set.of("REAL"), false),
        new Stage("roles", 6, "Les rôles", "Réalisation", "Les personnages à caster, écrits dans la V2.", Set.of(), true),
        new Stage("casting", 7, "Le casting", "Toute l'équipe", "Où en est le choix des acteurs, rôle par rôle.", Set.of(), true)
    );

    public static final List<Field> FIELDS = List.of(
        new Field("titre", "identite", "Titre du projet", "Ex. Lancement printemps 2027", Kind.TEXT, true, "title"),
        new Field("produit", "identite", "Produit ou service", "Ce que la publicité fait vendre ou connaître", Kind.TEXT, true, "product"),
        new Field("diffusion", "identite", "Date de diffusion", "Première diffusion prévue", Kind.DATE, true, "air_date"),
        new Field("duree", "identite", "Durée du film", "Ex. 30 s, puis une version 15 s", Kind.TEXT, true, null),
        new Field("supports", "identite", "Supports de diffusion", "Télévision, réseaux sociaux, cinéma, affichage…", Kind.TEXT, true, null),

        new Field("objectif", "brief", "Objectif", "Faire connaître, faire acheter, changer une image…", Kind.LONG, true, "objective"),
        new Field("cible", "brief", "Cible", "À qui la publicité s'adresse", Kind.LONG, true, "target"),
        new Field("message", "brief", "Message clé", "La phrase qu'on doit retenir", Kind.LONG, true, "key_message"),
        new Field("ton", "brief", "Ton souhaité", "Chaleureux, drôle, premium…", Kind.TEXT, true, null),
        new Field("contraintes", "brief", "Contraintes de la marque", "Logo, mentions légales, produits à montrer, interdits", Kind.LONG, false, null),

        new Field("idee", "concept", "L'idée", "Le concept en quelques phrases", Kind.LONG, true, null),
        new Field("accroche", "concept", "Accroche ou signature", "Le slogan de fin", Kind.TEXT, true, null),
        new Field("deroule", "concept", "Déroulé du film", "Ce qu'on voit, du début à la fin", Kind.LONG, true, null),
        new Field("references", "concept", "Références", "Films, photos, musiques qui donnent le ton", Kind.LONG, false, null),

        new Field("lieux", "production", "Lieux de tournage", "Villes, décors, intérieur ou extérieur", Kind.LONG, true, null),
        new Field("dates_tournage", "production", "Dates de tournage", "Ex. du 12 au 14 mars 2027", Kind.TEXT, true, null),
        new Field("planning", "production", "Planning", "Repérages, essais, PPM, tournage, livraison", Kind.LONG, true, null),
        new Field("equipe_tech", "production", "Équipe technique", "Chef opérateur, décorateur, costumière…", Kind.LONG, false, null),

        new Field("intention", "realisation", "Note d'intention", "Ce que le film doit faire ressentir", Kind.LONG, true, null),
        new Field("image", "realisation", "Image et lumière", "Cadre, couleurs, lumière", Kind.LONG, true, null),
        new Field("rythme", "realisation", "Rythme et montage", "Plans longs, montage nerveux, musique…", Kind.LONG, true, null),
        new Field("format", "realisation", "Format", "16:9, vertical 9:16, versions courtes…", Kind.TEXT, false, null)
    );

    public static final Map<String, Field> BY_KEY = FIELDS.stream().collect(Collectors.toMap(Field::key, Function.identity()));
    public static final Map<String, Stage> STAGE_BY_KEY = STAGES.stream().collect(Collectors.toMap(Stage::key, Function.identity()));

    public static List<Field> fieldsOf(String stage) { return FIELDS.stream().filter(f -> f.stage().equals(stage)).toList(); }
}
