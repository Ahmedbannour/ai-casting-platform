package com.castingai.entity;

/**
 * Rôles de la plateforme (cahier des charges v2, 19/11/2026). Chaque participant du cycle a son compte.
 * ADMIN : équipe Cercle ; valide les organisations, gère comptes et abonnements.
 * MARQUE : le client (annonceur) ; crée la demande de publicité et dépose la V0.
 * AGENCE_MARKETING : analyse la V0 et livre la V1 (le concept).
 * REALISATEUR : reprend la V1, écrit la V2 et l'intention de chaque rôle ; choisit ses acteurs.
 * BOITE_PROD : boîte de production ; organise le casting (shortlists, auditions, propositions).
 *              Reprend les comptes « AGENT » (agent de casting) d'avant la v2.
 * ACTEUR : comédien inscrit ; ne voit et ne modifie que sa propre fiche.
 */
public enum Role {
    ADMIN,
    BOITE_PROD,
    ACTEUR,
    MARQUE,
    AGENCE_MARKETING,
    REALISATEUR;

    /** Rôles qui travaillent sur le casting (vivier, projets, rôles, shortlists, recherche IA). */
    public boolean casting() { return this == ADMIN || this == BOITE_PROD || this == REALISATEUR; }
}
