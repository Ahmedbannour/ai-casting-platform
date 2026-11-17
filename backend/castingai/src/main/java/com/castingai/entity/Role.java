package com.castingai.entity;

/**
 * Rôles de la plateforme.
 * ADMIN : gère les agents et importe des acteurs.
 * AGENT : agent de casting, travaille sur les projets, rôles et shortlists.
 * ACTEUR : freelance inscrit lui-même ; ne voit et ne modifie que sa propre fiche.
 */
public enum Role {
    ADMIN,
    AGENT,
    ACTEUR
}
