import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/** T-113 · Page publique ouverte par le lien de vérification de l'adresse e-mail. */
@Component({
  selector: 'app-verify-page',
  standalone: true,
  imports: [RouterLink],
  template: `
  <main class="box">
    <a class="brand" routerLink="/"><span class="ring" aria-hidden="true"></span>AI Casting</a>
    @if (state() === 'wait') {
      <p class="muted" role="status">Vérification de votre adresse…</p>
    } @else if (state() === 'ok') {
      <svg class="done" viewBox="0 0 200 200" aria-hidden="true"><path d="M104 18 C 52 16, 14 52, 16 104 C 18 156, 62 186, 108 184 C 156 182, 188 146, 186 98 C 184 52, 150 20, 96 24"/><path class="tick" d="M66 104 L 92 130 L 140 76"/></svg>
      <h1>Adresse vérifiée</h1>
      <p class="muted" role="status">Merci {{ name() }}. L’adresse {{ email() }} est confirmée.</p>
      <a class="primary" routerLink="/auth/login">Se connecter</a>
    } @else {
      <h1>Lien plus valable</h1>
      <p class="muted" role="alert">{{ message() }}</p>
      <a class="ghost" routerLink="/auth/login">Aller à la connexion</a>
    }
  </main>`,
  styles: [`
    :host { display: grid; place-items: center; min-height: 100vh; background: var(--bg-primary); color: var(--text-primary); padding: 24px 16px; }
    .box { width: 100%; max-width: 440px; }
    .brand { display: inline-flex; align-items: center; gap: 10px; color: var(--text-primary); text-decoration: none; font-weight: 700; margin-bottom: 28px; }
    .ring { width: 18px; height: 18px; border: 3px solid var(--accent); border-radius: 50%; transform: rotate(-8deg) scaleX(1.12); }
    h1 { font-size: 30px; margin: 6px 0 8px; } .muted { color: var(--text-muted); line-height: 1.55; }
    .done { width: 84px; height: 84px; fill: none; stroke: var(--accent); stroke-width: 8; stroke-linecap: round; stroke-linejoin: round;
      path { stroke-dasharray: 640; stroke-dashoffset: 640; animation: draw .8s cubic-bezier(.6,.1,.3,1) forwards; }
      .tick { stroke-dasharray: 120; stroke-dashoffset: 120; animation-delay: .6s; animation-duration: .4s; } }
    @keyframes draw { to { stroke-dashoffset: 0; } }
    @media (prefers-reduced-motion: reduce) { .done path { animation: none; stroke-dashoffset: 0; } }
    .primary, .ghost { display: inline-flex; justify-content: center; align-items: center; height: 46px; padding: 0 22px; border-radius: 999px; font-weight: 600; text-decoration: none; margin-top: 16px; }
    .primary { background: var(--accent); color: var(--on-accent); } .ghost { border: 1px solid var(--border); color: var(--text-primary); }
  `]
})
export class VerifyPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
  readonly state = signal<'wait' | 'ok' | 'ko'>('wait');
  readonly name = signal('');
  readonly email = signal('');
  readonly message = signal('');

  ngOnInit(): void {
    // La vérification se fait au chargement de la page (et non par un simple aperçu du lien).
    this.http.post<{ firstName: string; email: string }>(`${environment.apiUrl}/public/email-verification/${encodeURIComponent(this.token)}`, {}).subscribe({
      next: r => { this.name.set(r.firstName); this.email.set(r.email); this.state.set('ok'); },
      error: (e: HttpErrorResponse) => {
        this.message.set(e.status === 0 ? 'Serveur injoignable. Réessayez dans un instant.'
          : e.error?.message ?? 'Ce lien a déjà servi ou a expiré. Demandez un nouveau lien à votre administrateur.');
        this.state.set('ko');
      }
    });
  }
}
