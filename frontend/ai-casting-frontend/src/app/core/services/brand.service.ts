import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Image de marque d'une boîte de production : nom affiché, couleur principale (#RRGGBB), logo. */
export interface Brand { orgId: string; name: string; color: string | null; logoUrl: string | null; }

/** Couleurs proposées au producer : toutes lisibles en mode sombre et en mode clair. */
export const BRAND_SWATCHES = ['#F5C518', '#E4572E', '#E8467C', '#9B5DE5', '#4361EE', '#1D9BF0', '#00A896', '#2BB673', '#F28C28', '#B08D57'];

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const hex = (c: Rgb) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * t) as Rgb;
/** Luminance relative (WCAG). */
export function luminance(h: string): number {
  return rgb(h).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); })
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
}

/**
 * Applique la couleur de la boîte à toute l'interface (boutons, onglets actifs, pastilles), en calculant
 * pour chaque mode une version lisible : texte posé sur la couleur, couleur utilisée comme texte.
 * La couleur « à soi » (celle de sa boîte) est remplacée le temps d'une room ou d'une invitation d'une autre boîte.
 */
@Injectable({ providedIn: 'root' })
export class BrandService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/production/marque`;
  /** Image de marque du compte connecté (sa boîte de production), ou null. */
  readonly own = signal<Brand | null>(null);
  /** Image de marque affichée en ce moment (la sienne, ou celle de la room ouverte). */
  readonly shown = signal<Brand | null>(null);

  setOwn(b: Brand | null): void { this.own.set(b); this.show(b); }
  /** Montre l'image d'une autre boîte (room, invitation) ; restore() revient à la sienne. */
  show(b: Brand | null): void { this.shown.set(b); this.paint(b?.color ?? null); }
  restore(): void { this.show(this.own()); }
  /** Aperçu en direct pendant le réglage, sans rien enregistrer. */
  preview(color: string | null): void { this.paint(color); }

  logoSrc(b: Brand | null | undefined): string | null { return b?.logoUrl ? environment.apiUrl + b.logoUrl : null; }

  mine(): Observable<Brand> { return this.http.get<Brand>(this.url); }
  save(name: string | null, color: string | null): Observable<Brand> { return this.http.put<Brand>(this.url, { name, color }).pipe(tap(b => this.setOwn(b))); }
  uploadLogo(file: File): Observable<Brand> { const fd = new FormData(); fd.append('file', file); return this.http.post<Brand>(`${this.url}/logo`, fd).pipe(tap(b => this.setOwn(b))); }
  removeLogo(): Observable<Brand> { return this.http.delete<Brand>(`${this.url}/logo`).pipe(tap(b => this.setOwn(b))); }

  private paint(color: string | null): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const vars = ['--brand', '--brand-hover', '--brand-on', '--brand-ink-dark', '--brand-ink-light'];
    if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) { root.removeAttribute('data-brand'); vars.forEach(v => root.style.removeProperty(v)); return; }
    const c = rgb(color), L = luminance(color), white: Rgb = [255, 255, 255], black: Rgb = [22, 23, 26];
    root.style.setProperty('--brand', color);
    root.style.setProperty('--brand-hover', hex(mix(c, L > 0.5 ? black : white, 0.14)));
    root.style.setProperty('--brand-on', L > 0.42 ? '#16171A' : '#FFFFFF');
    root.style.setProperty('--brand-ink-dark', L < 0.22 ? hex(mix(c, white, 0.45)) : color);     // couleur en texte sur fond sombre
    root.style.setProperty('--brand-ink-light', L > 0.32 ? hex(mix(c, black, 0.5)) : color);     // couleur en texte sur fond clair
    root.setAttribute('data-brand', '');
  }
}
