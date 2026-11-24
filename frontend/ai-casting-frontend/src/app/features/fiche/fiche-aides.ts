/**
 * P-085 · Les aides de la fiche : pour chaque champ, des choix rapides, un modèle, un exemple et une longueur conseillée,
 * écrits comme le ferait un producteur qui a déjà fait des dizaines de films publicitaires.
 * - toggle : liste courte séparée par des virgules (on coche, on décoche)
 * - line   : une ligne ajoutée au texte
 * - set    : remplace le texte (point de départ)
 */
import { RoleInput } from './fiche.service';

export type ChipMode = 'toggle' | 'line' | 'set';
export interface Aide { chips?: string[]; mode?: ChipMode; template?: string; example?: string; max?: number; }

export const AIDES: Record<string, Aide> = {
  titre: { example: 'Zitouna — lancement de l’huile bio, printemps 2027', max: 80 },
  produit: { example: 'Huile d’olive extra vierge bio Zitouna, bouteille 75 cl, nouvelle gamme', max: 160 },
  objectif: { mode: 'set', max: 300,
    chips: ['Faire connaître un nouveau produit', 'Faire acheter (lancement, promotion)', 'Changer l’image de la marque', 'Fidéliser les clients actuels', 'Expliquer un service', 'Attirer des talents (marque employeur)'],
    example: 'Faire connaître la nouvelle gamme bio et la faire essayer dès le premier mois en grande surface.' },
  cible: { mode: 'line', max: 400,
    chips: ['Familles, 30 à 50 ans', 'Jeunes adultes, 18 à 25 ans', 'Actifs urbains, 25 à 40 ans', 'Parents de jeunes enfants', 'Seniors, 60 ans et plus', 'Professionnels (B2B)'],
    template: 'Qui : …\nOù ils vivent : …\nCe qu’ils pensent aujourd’hui de la marque : …\nCe qu’on veut qu’ils pensent après le film : …',
    example: 'Familles tunisiennes, 30 à 50 ans, plutôt urbaines. Elles achètent de l’huile en vrac et ne voient pas la différence entre les marques.' },
  message: { max: 140, example: 'L’huile de nos grands-mères, enfin en bouteille.' },
  ton: { mode: 'toggle', max: 120, chips: ['Chaleureux', 'Drôle', 'Premium', 'Émouvant', 'Énergique', 'Authentique', 'Rassurant', 'Décalé'] },
  contraintes: { mode: 'line', max: 600,
    chips: ['Logo visible en fin de film', 'Mentions légales à l’écran', 'Produit en gros plan (packshot)', 'Version arabe et version française', 'Musique libre de droits', 'Pas de célébrité', 'Respect de la charte graphique'] },
  duree: { mode: 'toggle', max: 80, chips: ['6 s', '10 s', '15 s', '20 s', '30 s', '45 s', '60 s'] },
  supports: { mode: 'toggle', max: 200, chips: ['Télévision', 'Instagram', 'TikTok', 'Facebook', 'YouTube', 'Cinéma', 'Affichage digital', 'Site web'] },
  idee: { max: 600,
    template: 'Situation de départ : …\nCe qui se passe : …\nLa chute (ce qu’on retient) : …',
    example: 'Trois générations d’une même famille se passent la bouteille autour de l’olivier familial. À chaque passage, un souvenir. À la fin, la petite fille sert le plat.' },
  accroche: { max: 80, example: 'Zitouna. Le goût qui se transmet.' },
  deroule: { max: 1200,
    template: 'Ouverture (0 à 5 s) : …\nDéveloppement : …\nMoment fort : …\nPackshot et signature (5 dernières secondes) : …' },
  references: { mode: 'line', max: 600, chips: ['Film : … (lien)', 'Photo ou ambiance : …', 'Musique : …', 'Pub concurrente à éviter : …'] },
  intention: { max: 800,
    template: 'Ce que le spectateur doit ressentir : …\nComment on le filme : …\nCe qu’on évite : …',
    example: 'Une chaleur simple, sans nostalgie appuyée. Caméra proche des mains et des visages, lumière de fin de journée. On évite le cliché de la carte postale.' },
  image: { mode: 'line', max: 600, chips: ['Lumière naturelle', 'Caméra à l’épaule, proche des personnages', 'Plans fixes et cadres composés', 'Couleurs chaudes', 'Couleurs froides et contrastées', 'Studio, fond uni', 'Ralentis sur le produit'] },
  rythme: { mode: 'line', max: 600, chips: ['Plans longs, montage posé', 'Montage nerveux, coupes rapides', 'La musique porte le film', 'Dialogues au centre', 'Sans paroles, voix off', 'Plan-séquence'] },
  format: { mode: 'toggle', max: 160, chips: ['16:9 (TV, YouTube)', '9:16 (Stories, TikTok)', '1:1 (fil Instagram)', '4:5 (fil Instagram)'] },
  lieux: { mode: 'line', max: 600, chips: ['Studio', 'Appartement ou maison', 'Extérieur jour', 'Extérieur nuit', 'Commerce ou magasin', 'Usine ou atelier', 'Nature (plage, oliveraie, désert)', 'Médina'] },
  dates_tournage: { max: 120, example: 'Du 12 au 14 mars 2027 (2 jours + 1 jour de réserve météo)' },
  planning: { max: 1000,
    template: 'Repérages : …\nPPM (réunion de préparation avec la marque) : …\nTournage : …\nMontage et étalonnage : …\nValidation de la marque : …\nLivraison des fichiers : …' },
  equipe_tech: { mode: 'line', max: 800, chips: ['Chef opérateur', 'Ingénieur du son', 'Chef décorateur', 'Costumière', 'Maquillage et coiffure', 'Régisseur', 'Monteur', 'Étalonneur', 'Photographe de plateau'] },
};

/** Des rôles types : un clic remplit le nom, le sexe et la tranche d'âge. */
export const ROLE_TYPES: (RoleInput & { label: string })[] = [
  { label: 'La mère', name: 'La mère', intention: '', gender: 'Femme', minAge: 30, maxAge: 45 },
  { label: 'Le père', name: 'Le père', intention: '', gender: 'Homme', minAge: 30, maxAge: 45 },
  { label: 'L’enfant', name: 'L’enfant', intention: '', gender: null, minAge: 6, maxAge: 10 },
  { label: 'L’ado', name: 'L’adolescent', intention: '', gender: null, minAge: 13, maxAge: 17 },
  { label: 'La grand-mère', name: 'La grand-mère', intention: '', gender: 'Femme', minAge: 60, maxAge: 75 },
  { label: 'Le grand-père', name: 'Le grand-père', intention: '', gender: 'Homme', minAge: 60, maxAge: 75 },
  { label: 'Jeune femme active', name: 'Jeune femme active', intention: '', gender: 'Femme', minAge: 25, maxAge: 35 },
  { label: 'Jeune homme actif', name: 'Jeune homme actif', intention: '', gender: 'Homme', minAge: 25, maxAge: 35 },
  { label: 'Le commerçant', name: 'Le commerçant', intention: '', gender: null, minAge: 40, maxAge: 60 },
];
export const AGE_RANGES: { label: string; min: number; max: number }[] = [
  { label: '6–10', min: 6, max: 10 }, { label: '13–17', min: 13, max: 17 }, { label: '18–25', min: 18, max: 25 }, { label: '25–35', min: 25, max: 35 },
  { label: '35–50', min: 35, max: 50 }, { label: '50–65', min: 50, max: 65 }, { label: '65+', min: 65, max: 90 },
];
export const ROLE_INTENTIONS = ['Naturel, jamais « joué »', 'Complicité avec les autres personnages', 'Présence forte sans dialogue', 'Humour discret', 'Émotion retenue', 'Énergie et spontanéité', 'Parle arabe et français'];

/** Le chapitre suggère d'après ce qui est déjà écrit ailleurs dans la fiche. */
export function derived(key: string, vals: Record<string, string>): { label: string; value: string } | null {
  const sup = (vals['supports'] ?? '').toLowerCase();
  if (key === 'format' && sup) {
    const f: string[] = [];
    if (/t[ée]l[ée]|youtube|cin[ée]ma|site/.test(sup)) f.push('16:9 (TV, YouTube)');
    if (/tiktok|stor|instagram/.test(sup)) f.push('9:16 (Stories, TikTok)');
    if (/facebook|instagram/.test(sup)) f.push('4:5 (fil Instagram)');
    return f.length ? { label: 'D’après les supports', value: f.join(', ') } : null;
  }
  if (key === 'duree' && sup) {
    const d: string[] = [];
    if (/t[ée]l[ée]|cin[ée]ma/.test(sup)) d.push('30 s');
    if (/tiktok|instagram|facebook|youtube|stor/.test(sup)) d.push('15 s', '6 s');
    return d.length ? { label: 'D’après les supports', value: [...new Set(d)].join(', ') } : null;
  }
  if (key === 'accroche' && vals['message']) return { label: 'Reprendre le message clé', value: vals['message'] };
  return null;
}

/** Coche ou décoche un élément d'une liste « a, b, c ». */
export function toggleIn(text: string, item: string): string {
  const parts = text.split(/\s*,\s*/).map(x => x.trim()).filter(x => x);
  const i = parts.findIndex(p => p.toLowerCase() === item.toLowerCase());
  if (i >= 0) parts.splice(i, 1); else parts.push(item);
  return parts.join(', ');
}
export function hasIn(text: string, item: string, mode: ChipMode): boolean {
  const t = (text ?? '').toLowerCase(), it = item.toLowerCase();
  if (mode === 'toggle') return t.split(/\s*,\s*/).includes(it);
  if (mode === 'line') return t.split('\n').some(l => l.trim().replace(/^[-•]\s*/, '') === it);
  return t.trim() === it;
}
export function addLine(text: string, item: string): string {
  const lines = (text ?? '').split('\n');
  const i = lines.findIndex(l => l.trim().replace(/^[-•]\s*/, '').toLowerCase() === item.toLowerCase());
  if (i >= 0) { lines.splice(i, 1); return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(); }
  const t = (text ?? '').trimEnd();
  return t ? `${t}\n${item}` : item;
}
