import { AbstractControl, FormArray, ValidationErrors, ValidatorFn } from '@angular/forms';
import { frDate } from './dates';

/** Règles de saisie partagées par les formulaires (miroir des contrôles du serveur). */
export const RULES = {
  nameMax: 80,
  height: { min: 40, max: 250 },
  weight: { min: 3, max: 300 },
  age: { min: 0, max: 120 },
  birthMin: '1920-01-01',
  yearMin: 1900,
  bioMax: 2000
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^\+?[\d\s().-]{6,22}$/;

/** Refuse une valeur faite seulement d'espaces. */
export const notBlank: ValidatorFn = c =>
  typeof c.value === 'string' && c.value.length > 0 && !c.value.trim() ? { blank: true } : null;

/** Pas de chiffres ni de balises dans un nom propre. */
export const personName: ValidatorFn = c =>
  c.value && /[\d<>@#]/.test(c.value) ? { personName: true } : null;

export const phone: ValidatorFn = c => {
  if (!c.value) return null;
  const digits = String(c.value).replace(/\D/g, '').length;
  return !PHONE_RE.test(c.value) || digits < 6 || digits > 15 ? { phone: true } : null;
};

export const email: ValidatorFn = c => (c.value && !EMAIL_RE.test(String(c.value).trim()) ? { email: true } : null);

/** Nombre entier entre deux bornes (vide accepté). */
export function intBetween(min: number, max: number): ValidatorFn {
  return c => {
    const v = c.value;
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return { integer: true };
    return n < min || n > max ? { between: { min, max } } : null;
  };
}

/** Groupe « période » : fin ≥ début. */
export function periodOrder(fromKey = 'fromDate', toKey = 'toDate'): ValidatorFn {
  return g => {
    const f = g.get(fromKey)?.value, t = g.get(toKey)?.value;
    return f && t && t < f ? { periodOrder: true } : null;
  };
}

/** Tableau de périodes : aucune ne doit en chevaucher une autre. Marque l'index fautif. */
export const noOverlap: ValidatorFn = (arr: AbstractControl): ValidationErrors | null => {
  const rows = (arr as FormArray).controls
    .map((g, i) => ({ i, f: g.get('fromDate')?.value as string, t: g.get('toDate')?.value as string }))
    .filter(r => r.f && r.t && r.t >= r.f)
    .sort((a, b) => a.f.localeCompare(b.f));
  for (let k = 1; k < rows.length; k++) {
    if (rows[k].f <= rows[k - 1].t) return { overlap: { a: rows[k - 1].i, b: rows[k].i } };
  }
  return null;
};

/** Doublons de nom dans une liste (langues, compétences). */
export const uniqueNames: ValidatorFn = (arr: AbstractControl): ValidationErrors | null => {
  const seen = new Map<string, number>();
  const dups: number[] = [];
  (arr as FormArray).controls.forEach((g, i) => {
    const n = String(g.get('name')?.value ?? '').trim().toLowerCase();
    if (!n) return;
    if (seen.has(n)) dups.push(i); else seen.set(n, i);
  });
  return dups.length ? { duplicate: dups } : null;
};

/** Message français pour la première erreur d'un contrôle. */
export function errorMessage(errors: ValidationErrors | null | undefined, label = 'Ce champ'): string {
  if (!errors) return '';
  if (errors['required'] || errors['blank']) return `${label} est obligatoire.`;
  if (errors['maxlength']) return `${errors['maxlength'].requiredLength} caractères au plus.`;
  if (errors['personName']) return 'Pas de chiffres ni de symboles dans un nom.';
  if (errors['email']) return 'Adresse e-mail incomplète (ex. nom@domaine.fr).';
  if (errors['phone']) return 'Numéro invalide : chiffres, espaces et « + » uniquement (6 à 15 chiffres).';
  if (errors['integer']) return 'Nombre entier attendu.';
  if (errors['between']) return `Entre ${errors['between'].min} et ${errors['between'].max}.`;
  if (errors['dateFormat']) return 'Date incomplète ou inexistante (jj/mm/aaaa).';
  if (errors['dateMin']) return `Au plus tôt le ${frDate(errors['dateMin'].min)}.`;
  if (errors['dateMax']) return `Au plus tard le ${frDate(errors['dateMax'].max)}.`;
  return 'Valeur invalide.';
}
