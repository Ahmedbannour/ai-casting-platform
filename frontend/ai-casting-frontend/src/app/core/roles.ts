/** Rôles de la plateforme (cahier des charges v2, 19/11/2026). */
export type Role = 'ADMIN' | 'BOITE_PROD' | 'ASSISTANT_PROD' | 'ACTEUR' | 'MARQUE' | 'AGENCE_MARKETING' | 'REALISATEUR';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrateur',
  MARQUE: 'Marque',
  AGENCE_MARKETING: 'Agence marketing',
  REALISATEUR: 'Réalisateur',
  BOITE_PROD: 'Boîte de production',
  ASSISTANT_PROD: 'Assistante de production',
  ACTEUR: 'Acteur'
};

export function roleLabel(r: string | null | undefined): string { return ROLE_LABELS[r as Role] ?? r ?? ''; }

/** Rôles qui travaillent sur le casting : vivier, projets, rôles, shortlists, propositions d'acteurs. */
export const CASTING_ROLES: Role[] = ['ADMIN', 'BOITE_PROD', 'REALISATEUR'];

/** Autorisations que le producer donne à son assistante de production. */
export const PERMS: { key: string; label: string; hint: string }[] = [
  { key: 'PROJETS', label: 'Créer les projets', hint: 'Créer, modifier et annuler les projets de publicité' },
  { key: 'INVITATIONS', label: 'Inviter marque et agence', hint: 'Envoyer les invitations à la marque et à l’agence marketing' },
  { key: 'EQUIPE', label: 'Réalisateur et attentes', hint: 'Rattacher le réalisateur, écrire la note d’intention et les rôles sans réalisateur' },
  { key: 'ROOM', label: 'Diriger la room', hint: 'Tâches, documents et autorisations de la room de casting' },
  { key: 'CASTING', label: 'Casting', hint: 'Vivier d’acteurs, projets, propositions IA et shortlists' }
];

/** Type d'organisation attendu pour chaque rôle (le réalisateur peut aussi être indépendant). */
export const ORG_KIND: Partial<Record<Role, 'MARQUE' | 'AGENCE_MARKETING' | 'BOITE_PROD'>> = {
  MARQUE: 'MARQUE', AGENCE_MARKETING: 'AGENCE_MARKETING', BOITE_PROD: 'BOITE_PROD', ASSISTANT_PROD: 'BOITE_PROD', REALISATEUR: 'BOITE_PROD'
};

export const ORG_LABELS: Record<string, string> = {
  MARQUE: 'Marque', AGENCE_MARKETING: 'Agence marketing', BOITE_PROD: 'Boîte de production'
};
