import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';

/** T-113 · Rappel discret quand l'adresse e-mail du compte n'est pas encore vérifiée (masquable pour la session). */
@Component({
  selector: 'app-email-banner',
  standalone: true,
  template: `
    @if (show()) {
      <div class="eb" role="status">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
        <span>Votre adresse <b>{{ email() }}</b> n’est pas encore vérifiée.
          {{ actor ? 'Votre agence ou notre équipe vous enverra un lien de vérification ; vous pouvez aussi le demander depuis la page Contact.' : 'Demandez un lien de vérification à votre administrateur.' }}</span>
        <button type="button" (click)="hide()" aria-label="Masquer ce rappel">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
    }`,
  styles: [`
    .eb { display: flex; align-items: center; gap: 10px; margin: 12px 32px 0; padding: 10px 12px 10px 14px; border-radius: 12px; font-size: 13.5px; line-height: 1.45;
      background: var(--accent-dim); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); color: var(--text-primary); }
    svg { width: 18px; height: 18px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    .eb > svg:first-child { color: var(--accent-ink); }
    span { flex: 1; } b { font-weight: 600; }
    button { width: 30px; height: 30px; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: var(--text-muted); cursor: pointer; flex: none;
      &:hover { background: var(--bg-hover); color: var(--text-primary); } }
    @media (max-width: 860px) { .eb { margin: 10px 14px 0; } }
  `]
})
export class EmailBannerComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly actor = inject(AuthService).role() === 'ACTEUR';
  readonly show = signal(false);
  readonly email = signal('');

  ngOnInit(): void {
    try { if (sessionStorage.getItem('email-banner-hidden')) return; } catch { /* stockage indisponible */ }
    this.http.get<{ email: string; verified: boolean }>(`${environment.apiUrl}/me/email`).subscribe({
      next: r => { this.email.set(r.email); this.show.set(!r.verified); }, error: () => {}
    });
  }

  hide(): void { this.show.set(false); try { sessionStorage.setItem('email-banner-hidden', '1'); } catch { /* rien */ } }
}
