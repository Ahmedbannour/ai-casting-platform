/** Rôles de la plateforme (cahier des charges v2, 19/11/2026). */
export type Role = 'ADMIN' | 'BOITE_PROD' | 'ACTEUR' | 'MARQUE' | 'AGENCE_MARKETING' | 'REALISATEUR';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrateur',
  MARQUE: 'Marque',
  AGENCE_MARKETING: 'Agence marketing',
  REALISATEUR: 'Réalisateur',
  BOITE_PROD: 'Boîte de production',
  ACTEUR: 'Acteur'
};

export function roleLabel(r: string | null | undefined): string { return ROLE_LABELS[r as Role] ?? r ?? ''; }

/** Rôles qui travaillent sur le casting : vivier, projets, rôles, shortlists, propositions d'acteurs. */
export const CASTING_ROLES: Role[] = ['ADMIN', 'BOITE_PROD', 'REALISATEUR'];

/** Type d'organisation attendu pour chaque rôle (le réalisateur peut aussi être indépendant). */
export const ORG_KIND: Partial<Record<Role, 'MARQUE' | 'AGENCE_MARKETING' | 'BOITE_PROD'>> = {
  MARQUE: 'MARQUE', AGENCE_MARKETING: 'AGENCE_MARKETING', BOITE_PROD: 'BOITE_PROD', REALISATEUR: 'BOITE_PROD'
};

export const ORG_LABELS: Record<string, string> = {
  MARQUE: 'Marque', AGENCE_MARKETING: 'Agence marketing', BOITE_PROD: 'Boîte de production'
};
