/** Utilitaires de dates « calendaires » (sans fuseau) au format ISO AAAA-MM-JJ. */

export const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** Abréviations usuelles des mois. */
export const MONTHS_SHORT_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const DAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Date locale → « 2026-11-16 ». */
export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** « 2026-11-16 » → Date locale (midi, pour éviter les surprises d'heure d'été), ou null. */
export function fromIso(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

/** « 2026-11-16 » → « 16/11/2026 ». */
export function frDate(s: string | null | undefined): string {
  const d = fromIso(s);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

/** « 16/11/2026 », « 16-11-2026 » ou « 16112026 » → ISO, ou null si la date n'existe pas. */
export function parseFr(text: string): string | null {
  const digits = text.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const day = +digits.slice(0, 2), month = +digits.slice(2, 4), year = +digits.slice(4);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return null;
  const d = new Date(year, month - 1, day, 12);
  return d.getMonth() === month - 1 && d.getDate() === day ? toIso(d) : null;
}

export function todayIso(): string { return toIso(new Date()); }

export function addDays(iso: string, n: number): string {
  const d = fromIso(iso)!; d.setDate(d.getDate() + n); return toIso(d);
}

export function addMonths(iso: string, n: number): string {
  const d = fromIso(iso)!;
  const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toIso(d);
}

/** Les dates ISO se comparent comme des chaînes. */
export function clampIso(iso: string, min?: string | null, max?: string | null): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/** Âge révolu à une date donnée. */
export function ageAt(birthIso: string, atIso = todayIso()): number | null {
  const b = fromIso(birthIso), a = fromIso(atIso);
  if (!b || !a) return null;
  let age = a.getFullYear() - b.getFullYear();
  if (a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate())) age--;
  return age;
}
