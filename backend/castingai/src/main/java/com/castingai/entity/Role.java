package com.castingai.entity;

/**
 * Rôles de la plateforme (cahier des charges v2, 19/11/2026). Chaque participant du cycle a son compte.
 * ADMIN : équipe Cercle ; valide les organisations, gère comptes et abonnements.
 * MARQUE : le client (annonceur) ; crée la demande de publicité et dépose la V0.
 * AGENCE_MARKETING : analyse la V0 et livre la V1 (le concept).
 * REALISATEUR : reprend la V1, écrit la V2 et l'intention de chaque rôle ; choisit ses acteurs.
 * BOITE_PROD : boîte de production ; organise le casting (shortlists, auditions, propositions).
 *              Reprend les comptes « AGENT » (agent de casting) d'avant la v2.
 * ASSISTANT_PROD : assistante de production, rattachée à une boîte ; fait ce que le producer lui autorise
 *              (créer les projets, inviter marque et agence, équipe et attentes, room, casting).
 * ACTEUR : comédien inscrit ; ne voit et ne modifie que sa propre fiche.
 */
public enum Role {
    ADMIN,
    BOITE_PROD,
    ASSISTANT_PROD,
    ACTEUR,
    MARQUE,
    AGENCE_MARKETING,
    REALISATEUR,
    /** P-087 · Membre de l'équipe technique d'un tournage, invité par lien sur un poste. */
    TECHNICIEN;

    /** Rôles qui travaillent sur le casting (vivier, projets, rôles, shortlists, recherche IA). */
    public boolean casting() { return this == ADMIN || this == BOITE_PROD || this == ASSISTANT_PROD || this == REALISATEUR; }

    /** Côté production : le producer et ses assistantes. */
    public boolean production() { return this == BOITE_PROD || this == ASSISTANT_PROD; }
}
