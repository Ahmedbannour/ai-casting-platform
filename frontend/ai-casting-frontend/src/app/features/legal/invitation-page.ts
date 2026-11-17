import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { TokenService } from '../../core/services/token.service';
import { AuthResponse } from '../../core/services/auth.service';

interface Preview { firstName: string; agencyName: string | null; email: string | null; agencyActor: boolean; expiresAt: number; }

/** T-102 · Page publique ouverte par le lien d'invitation : l'acteur crée son compte et reprend sa fiche. */
@Component({
  selector: 'app-invitation-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
  <main class="inv">
    <p class="brand">AI Casting</p>
    @if (loading()) { <p class="muted">Ouverture de votre invitation…</p> }
    @else if (!pv()) {
      <h1>Lien plus valable</h1>
      <p class="muted">{{ gone() }}</p>
      <p><a routerLink="/auth/login">Aller à la connexion</a></p>
    } @else {
      @let p = pv()!;
      <h1>Bonjour {{ p.firstName }}</h1>
      <p class="lead">{{ p.agencyName ? p.agencyName + ' a créé votre fiche d’acteur.' : 'Votre fiche d’acteur vous attend.' }}
        Créez votre compte pour la tenir à jour vous-même : photos, disponibilités, expériences.</p>

      <form (ngSubmit)="submit()" (input)="error.set('')" (change)="error.set('')" novalidate>
        <label for="e">Adresse e-mail</label>
        <input id="e" name="e" type="email" [(ngModel)]="email" autocomplete="email" placeholder="vous@exemple.com" />
        <label for="pw">Mot de passe</label>
        <input id="pw" name="pw" type="password" [(ngModel)]="password" autocomplete="new-password" placeholder="8 caractères au moins" />

        @if (p.agencyActor) {
          <fieldset>
            <legend>Qui peut voir votre fiche ?</legend>
            <label class="opt" [class.on]="pool === false"><input type="radio" name="pool" [value]="false" [(ngModel)]="pool" />
              <span><b>Rester chez {{ p.agencyName || 'mon agence' }}</b><small>Seule votre agence voit votre fiche et vous propose des rôles.</small></span></label>
            <label class="opt" [class.on]="pool === true"><input type="radio" name="pool" [value]="true" [(ngModel)]="pool" />
              <span><b>Rejoindre le vivier commun</b><small>Toutes les agences sous contrat peuvent vous trouver ; vos coordonnées restent masquées et chaque consultation vous est signalée.</small></span></label>
          </fieldset>
        }

        <fieldset>
          <legend>Votre âge</legend>
          <div class="seg" role="radiogroup" aria-label="Votre âge">
            <button type="button" role="radio" [attr.aria-checked]="age() === 'MAJEUR'" [class.on]="age() === 'MAJEUR'" (click)="age.set('MAJEUR'); error.set('')">18 ans ou plus</button>
            <button type="button" role="radio" [attr.aria-checked]="age() === 'MINEUR'" [class.on]="age() === 'MINEUR'" (click)="age.set('MINEUR'); error.set('')">Moins de 18 ans</button>
          </div>
        </fieldset>
        @if (age() === 'MINEUR') {
          <label for="g">Nom du parent ou représentant légal qui donne son accord</label>
          <input id="g" name="g" [(ngModel)]="guardian" maxlength="120" placeholder="Prénom et nom" />
        }
        <label class="check"><input type="checkbox" name="ok" [(ngModel)]="accept" />
          <span>J'accepte les <a routerLink="/legal/conditions" target="_blank">conditions d'utilisation</a> et la <a routerLink="/legal/confidentialite" target="_blank">politique de confidentialité</a>.</span></label>

        @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
        <button type="submit" class="primary" [disabled]="busy()">{{ busy() ? 'Création du compte…' : 'Créer mon compte' }}</button>
      </form>
      <p class="muted small">Lien valable jusqu'au {{ day(p.expiresAt) }}, une seule fois. Déjà un compte ? <a routerLink="/auth/login">Se connecter</a></p>
    }
  </main>`,
  styles: [`
    :host { display: grid; place-items: start center; min-height: 100vh; background: var(--bg-primary); color: var(--text-primary); padding: 40px 16px; }
    .inv { width: 100%; max-width: 500px; }
    .brand { font-weight: 700; color: var(--accent); margin: 0 0 18px; }
    h1 { font-size: 30px; line-height: 1.15; margin: 0 0 10px; }
    .lead { color: var(--text-muted); line-height: 1.55; margin: 0 0 22px; }
    .muted { color: var(--text-muted); line-height: 1.5; } .small { font-size: 13px; margin-top: 16px; }
    form { display: flex; flex-direction: column; }
    label { font-size: 13px; font-weight: 600; margin: 0 0 6px; }
    input:not([type=radio]):not([type=checkbox]) { height: 42px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-secondary, transparent);
      color: var(--text-primary); padding: 0 12px; font: inherit; margin-bottom: 14px; }
    fieldset { border: 0; padding: 0; margin: 0 0 14px; }
    legend { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .opt { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; cursor: pointer; font-weight: 400; }
    .opt.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
    .opt input { margin-top: 3px; accent-color: var(--accent); }
    .opt b { display: block; font-size: 14px; } .opt small { display: block; color: var(--text-muted); font-size: 13px; line-height: 1.45; margin-top: 2px; }
    .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .seg button { height: 42px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--text-primary); font: inherit; font-size: 14px; cursor: pointer; }
    .seg button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); font-weight: 600; }
    .check { display: flex; gap: 10px; align-items: flex-start; font-weight: 400; font-size: 14px; line-height: 1.45; margin: 4px 0 16px; cursor: pointer; }
    .check input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--accent); flex: none; }
    a { color: var(--accent); }
    .err { color: var(--danger); font-size: 14px; margin: 0 0 12px; }
    .primary { height: 46px; border-radius: 999px; border: 0; background: var(--accent); color: var(--on-accent, #111); font: inherit; font-weight: 600; cursor: pointer; }
    .primary:disabled { opacity: .6; cursor: progress; }
    button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  `]
})
export class InvitationPageComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);
  private readonly router = inject(Router);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
  private readonly url = `${environment.apiUrl}/public/invitations/${encodeURIComponent(this.token)}`;

  readonly loading = signal(true);
  readonly pv = signal<Preview | null>(null);
  readonly gone = signal('');
  readonly age = signal<'MAJEUR' | 'MINEUR' | ''>('');
  readonly busy = signal(false);
  readonly error = signal('');
  email = ''; password = ''; guardian = ''; accept = false; pool = false;

  ngOnInit(): void {
    this.http.get<Preview>(this.url).subscribe({
      next: p => { this.pv.set(p); this.email = p.email ?? ''; this.loading.set(false); },
      error: (e: HttpErrorResponse) => {
        this.gone.set(e.status === 0 ? 'Serveur injoignable. Réessayez dans un instant.'
          : e.error?.message ?? 'Ce lien a déjà servi, a expiré ou a été remplacé. Demandez un nouveau lien à votre agence.');
        this.loading.set(false);
      }
    });
  }

  submit(): void {
    const err = !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(this.email.trim()) ? 'Indiquez une adresse e-mail valide.'
      : this.password.length < 8 ? 'Choisissez un mot de passe de 8 caractères au moins.'
      : !this.age() ? 'Indiquez votre âge.'
      : this.age() === 'MINEUR' && this.guardian.trim().length < 3 ? 'Indiquez le nom du parent ou représentant légal.'
      : !this.accept ? 'Cochez la case pour créer votre compte.' : '';
    this.error.set(err);
    if (err) return;
    this.busy.set(true);
    this.http.post<AuthResponse>(`${this.url}/accept`, {
      email: this.email.trim(), password: this.password, acceptTerms: true, age: this.age(),
      guardianName: this.age() === 'MINEUR' ? this.guardian.trim() : undefined, joinPool: this.pool === true
    }).subscribe({
      next: r => { this.tokens.setTokens(r.accessToken, r.refreshToken, r.role); this.router.navigateByUrl('/mon-profil'); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Création du compte impossible. Réessayez.'); }
    });
  }

  day(ms: number): string { return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
}
