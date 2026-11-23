import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';

const KEY = 'email-banner-hidden';
const WEEK = 7 * 24 * 3600 * 1000;

/**
 * T-113 · Rappel quand l'adresse e-mail n'est pas vérifiée : une ligne fine, le détail sur demande.
 * Masqué, il reste masqué une semaine sur cet appareil.
 */
@Component({
  selector: 'app-email-banner',
  standalone: true,
  template: `
    @if (show()) {
      <div class="eb" role="status">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
        <span class="t">Adresse <b>{{ email() }}</b> non vérifiée.
          <button type="button" class="more" [attr.aria-expanded]="open()" (click)="open.set(!open())">{{ open() ? 'Moins' : 'Que faire ?' }}</button>
          @if (open()) {
            <span class="why">{{ actor ? 'Votre agence ou notre équipe vous enverra un lien de vérification ; vous pouvez aussi le demander depuis la page Contact.' : 'Demandez un lien de vérification à votre administrateur.' }}</span>
          }
        </span>
        <button type="button" class="x" (click)="hide()" aria-label="Masquer ce rappel pour une semaine" title="Masquer pour une semaine">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
    }`,
  styles: [`
    .eb { display: flex; align-items: center; gap: 8px; margin: 10px 32px 0; padding: 2px 2px 2px 12px; min-height: 44px; border-radius: 12px; font-size: 13px; line-height: 1.4;
      background: var(--accent-dim); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); color: var(--text-primary); }
    svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    .eb > svg:first-child { color: var(--accent-ink); }
    .t { flex: 1; min-width: 0; padding: 6px 0; } b { font-weight: 600; overflow-wrap: anywhere; }
    .why { display: block; margin-top: 4px; color: var(--text-secondary); }
    .more { border: 0; background: none; padding: 9px 6px; margin: -9px -4px; display: inline-block; color: var(--accent-ink); font: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
    .x { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 10px; background: transparent; color: var(--text-muted); cursor: pointer; flex: none;
      &:hover { background: var(--bg-hover); color: var(--text-primary); } }
    @media (max-width: 860px) { .eb { margin: 8px 14px 0; font-size: 12.5px; } .eb b { display: none; } }
  `]
})
export class EmailBannerComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly actor = inject(AuthService).role() === 'ACTEUR';
  readonly show = signal(false);
  readonly open = signal(false);
  readonly email = signal('');

  ngOnInit(): void {
    try { const t = Number(localStorage.getItem(KEY) ?? 0); if (t && Date.now() - t < WEEK) return; } catch { /* stockage indisponible */ }
    this.http.get<{ email: string; verified: boolean }>(`${environment.apiUrl}/me/email`).subscribe({
      next: r => { this.email.set(r.email); this.show.set(!r.verified); }, error: () => {}
    });
  }

  hide(): void { this.show.set(false); try { localStorage.setItem(KEY, String(Date.now())); } catch { /* rien */ } }
}
