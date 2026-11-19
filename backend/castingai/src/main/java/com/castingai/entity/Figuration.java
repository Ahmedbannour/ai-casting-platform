package com.castingai.entity;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/** Types de figuration qu'un acteur peut accepter (cahier v2, EX-52). */
public enum Figuration {
    /** Figurant (extra) : de passage dans le décor, sans action particulière. */
    EXTRA,
    /** Silhouette : figurant remarqué, avec une action ou un geste précis. */
    SILHOUETTE,
    /** Figurant spécial : une compétence ou une apparence particulière (métier, sport, véhicule…). */
    FIGURANT_SPECIAL;

    /** Liste reçue de l'app → colonne ; null = ne pas toucher. Valeur inconnue → IllegalArgumentException. */
    public static String toColumn(List<String> values) {
        if (values == null) return null;
        return String.join(",", values.stream().filter(Objects::nonNull).map(String::trim).filter(s -> !s.isEmpty())
                .map(s -> { try { return valueOf(s).name(); } catch (IllegalArgumentException e) {
                    throw new IllegalArgumentException("Type de figuration inconnu : " + s); } })
                .distinct().toList());
    }

    /** Colonne → liste pour l'app ; null = pas encore répondu. */
    public static List<String> fromColumn(String column) {
        if (column == null) return null;
        return column.isBlank() ? List.of() : Arrays.stream(column.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }
}
