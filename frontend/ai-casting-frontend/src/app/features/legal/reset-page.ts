import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface Preview { firstName: string; email: string; expiresAt: number; }

/** T-112 · Page publique ouverte par le lien de réinitialisation donné par l'administrateur. */
@Component({
  selector: 'app-reset-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
  <main class="box">
    <a class="brand" routerLink="/"><span class="ring" aria-hidden="true"></span><span class="wordmark">Cercle</span></a>
    @if (loading()) { <p class="muted">Vérification du lien…</p> }
    @else if (done()) {
      <h1>Mot de passe changé</h1>
      <p class="muted">Vous pouvez vous connecter avec votre nouveau mot de passe. Vos autres sessions ont été fermées.</p>
      <a class="primary" routerLink="/auth/login">Se connecter</a>
    } @else if (!pv()) {
      <h1>Lien plus valable</h1>
      <p class="muted">{{ gone() }}</p>
      <a class="ghost" routerLink="/auth/login">Aller à la connexion</a>
    } @else {
      <h1>Nouveau mot de passe</h1>
      <p class="muted">Bonjour {{ pv()!.firstName }} ({{ pv()!.email }}). Choisissez un nouveau mot de passe pour votre compte.</p>
      <form (ngSubmit)="submit()" novalidate>
        <label for="pw">Nouveau mot de passe</label>
        <div class="pw"><input id="pw" name="pw" [type]="show() ? 'text' : 'password'" [(ngModel)]="password" (ngModelChange)="error.set('')"
               autocomplete="new-password" placeholder="8 caractères au moins" [attr.aria-invalid]="!!error()" />
          <button type="button" class="eye" (click)="show.set(!show())">{{ show() ? 'Masquer' : 'Afficher' }}</button></div>
        <label for="pw2">Confirmez</label>
        <input id="pw2" name="pw2" [type]="show() ? 'text' : 'password'" [(ngModel)]="confirm" (ngModelChange)="error.set('')" autocomplete="new-password" />
        @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
        <button type="submit" class="primary" [disabled]="busy()">{{ busy() ? 'Enregistrement…' : 'Changer mon mot de passe' }}</button>
      </form>
      <p class="muted small">Ce lien ne sert qu'une fois et expire à {{ time(pv()!.expiresAt) }}.</p>
    }
  </main>`,
  styles: [`
    :host { display: grid; place-items: center; min-height: 100vh; background: var(--bg-primary); color: var(--text-primary); padding: 24px 16px; }
    .box { width: 100%; max-width: 440px; }
    .brand { display: inline-flex; align-items: center; gap: 10px; color: var(--text-primary); text-decoration: none; font-weight: 700; margin-bottom: 28px; }
    .ring { width: 18px; height: 18px; border: 3px solid var(--accent); border-radius: 50%; transform: rotate(-8deg) scaleX(1.12); }
    h1 { font-size: 30px; margin: 0 0 8px; } .muted { color: var(--text-muted); line-height: 1.55; } .small { font-size: 13px; margin-top: 14px; }
    form { display: flex; flex-direction: column; gap: 6px; margin-top: 18px; }
    label { font-size: 13px; font-weight: 600; margin-top: 8px; }
    input { height: 44px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-primary); padding: 0 12px; font: inherit; width: 100%; box-sizing: border-box; }
    input[aria-invalid="true"] { border-color: var(--danger); }
    .pw { position: relative; } .pw input { padding-right: 84px; }
    .eye { position: absolute; right: 6px; top: 6px; height: 32px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: var(--text-muted); font: inherit; font-size: 13px; cursor: pointer; }
    .err { color: var(--danger); font-size: 14px; margin: 6px 0 0; }
    .primary, .ghost { display: inline-flex; justify-content: center; align-items: center; height: 46px; padding: 0 22px; border-radius: 999px; font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; margin-top: 14px; }
    .primary { border: 0; background: var(--accent); color: var(--on-accent); } .primary:disabled { opacity: .6; }
    .ghost { border: 1px solid var(--border); color: var(--text-primary); }
  `]
})
export class ResetPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/public/password-reset/${encodeURIComponent(inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '')}`;
  readonly loading = signal(true);
  readonly pv = signal<Preview | null>(null);
  readonly gone = signal('');
  readonly done = signal(false);
  readonly busy = signal(false);
  readonly show = signal(false);
  readonly error = signal('');
  password = ''; confirm = '';

  ngOnInit(): void {
    this.http.get<Preview>(this.url).subscribe({
      next: p => { this.pv.set(p); this.loading.set(false); },
      error: (e: HttpErrorResponse) => {
        this.gone.set(e.status === 0 ? 'Serveur injoignable. Réessayez dans un instant.'
          : e.error?.message ?? 'Ce lien a déjà servi ou a expiré. Demandez un nouveau lien à votre administrateur.');
        this.loading.set(false);
      }
    });
  }

  submit(): void {
    if (this.password.length < 8) { this.error.set('Choisissez un mot de passe de 8 caractères au moins.'); return; }
    if (this.password !== this.confirm) { this.error.set('Les deux mots de passe ne sont pas identiques.'); return; }
    this.busy.set(true);
    this.http.post(this.url, { password: this.password }).subscribe({
      next: () => { this.busy.set(false); this.done.set(true); this.password = this.confirm = ''; },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Changement impossible. Réessayez.'); }
    });
  }

  time(ms: number): string { return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
}
