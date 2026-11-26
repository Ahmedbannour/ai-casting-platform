import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TokenService } from '../../core/services/token.service';
import { CrewPreview, FicheService } from './fiche.service';

/**
 * P-087 · Le lien d'invitation d'un poste de l'équipe technique.
 * La personne saisit le mot de passe de son compte s'il existe, sinon elle crée son compte avec un mot de passe :
 * elle est affectée au poste et arrive directement sur le dossier du film.
 */
@Component({
  selector: 'app-crew-join',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
  <main class="inv">
    <p class="brand">Cercle</p>
    @if (loading()) { <p class="muted">Ouverture de votre invitation…</p> }
    @else if (!pv()) {
      <h1>Lien plus valable</h1>
      <p class="muted">{{ gone() }}</p>
      <p><a routerLink="/auth/login">Aller à la connexion</a></p>
    } @else {
      @let p = pv()!;
      <section class="hero" aria-labelledby="inv-h">
        <small>{{ p.inviter ? p.inviter + ' · ' : '' }}{{ p.production || 'La production' }}</small>
        <h1 id="inv-h">Vous rejoignez l’équipe technique</h1>
        <dl class="post">
          <div><dt>Poste</dt><dd>{{ p.post }}</dd></div>
          <div><dt>Film</dt><dd>{{ p.requestTitle }}{{ p.brandName ? ' · ' + p.brandName : '' }}</dd></div>
        </dl>
        <p class="lead">Une fois votre accès confirmé, vous arrivez sur le dossier du film : planning, lieux, équipe et documents.</p>
      </section>

      <div class="tabs" role="tablist" aria-label="Votre compte">
        <button type="button" role="tab" [attr.aria-selected]="mode() === 'creation'" (click)="setMode('creation')">Créer mon compte</button>
        <button type="button" role="tab" [attr.aria-selected]="mode() === 'connexion'" (click)="setMode('connexion')">J’ai déjà un compte</button>
      </div>

      <form (ngSubmit)="submit()" novalidate>
        @if (mode() === 'creation') {
          <div class="row">
            <label>Prénom<input name="fn" autocomplete="given-name" [(ngModel)]="firstName" required /></label>
            <label>Nom<input name="ln" autocomplete="family-name" [(ngModel)]="lastName" required /></label>
          </div>
        }
        <label>Adresse e-mail<input name="em" type="email" autocomplete="email" [(ngModel)]="email" required /></label>
        <label>{{ mode() === 'connexion' ? 'Mot de passe de votre compte' : 'Choisissez un mot de passe' }}
          <span class="pw"><input name="pw" [type]="show() ? 'text' : 'password'" [autocomplete]="mode() === 'connexion' ? 'current-password' : 'new-password'"
                 [(ngModel)]="password" required minlength="8" [attr.aria-describedby]="mode() === 'creation' ? 'pw-h' : null" />
            <button type="button" class="eye" (click)="show.set(!show())" [attr.aria-label]="show() ? 'Masquer le mot de passe' : 'Afficher le mot de passe'">{{ show() ? 'Masquer' : 'Afficher' }}</button></span>
        </label>
        @if (mode() === 'creation') {
          <small id="pw-h" class="hint">8 caractères au moins.</small>
          <div class="row">
            <label>Téléphone <em>pour la feuille de service</em><input name="ph" type="tel" autocomplete="tel" [(ngModel)]="phone" /></label>
            <label>Ville<input name="ci" autocomplete="address-level2" [(ngModel)]="city" /></label>
          </div>
          <label class="check"><input type="checkbox" name="ok" [(ngModel)]="accept" /><span>J’ai 18 ans ou plus et j’accepte les <a routerLink="/legal/conditions" target="_blank">conditions d’utilisation</a> et la <a routerLink="/legal/confidentialite" target="_blank">politique de confidentialité</a>.</span></label>
        } @else {
          <p class="muted small">Mot de passe oublié ? <a routerLink="/auth/login">Réinitialisez-le depuis la connexion</a>, puis rouvrez ce lien.</p>
        }
        @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
        <button type="submit" class="primary" [disabled]="busy()">{{ busy() ? 'Un instant…' : mode() === 'connexion' ? 'Me connecter et rejoindre le poste' : 'Créer mon compte et rejoindre le poste' }}</button>
      </form>
    }
  </main>
  `,
  styles: [`
    :host { display: grid; place-items: start center; min-height: 100vh; background: var(--bg-primary); color: var(--text-primary); padding: 36px 16px; }
    .inv { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 16px; }
    .brand { font-weight: 800; font-size: 22px; color: var(--accent-ink); margin: 0; }
    .hero { padding: 22px 20px 20px; border-radius: 20px; border: 1px solid var(--border); background: var(--glass); animation: rise .45s cubic-bezier(.2,.8,.2,1) both; }
    .hero small { color: var(--text-subtle); font-size: 12.5px; font-weight: 600; }
    .hero h1 { font-size: 26px; line-height: 1.15; margin: 6px 0 12px; }
    .post { margin: 0 0 12px; display: flex; flex-direction: column; gap: 8px; }
    .post div { display: flex; gap: 10px; align-items: baseline; } .post dt { width: 52px; flex: none; font-size: 12.5px; color: var(--text-muted); }
    .post dd { margin: 0; font-weight: 700; font-size: 16px; }
    .lead { color: var(--text-muted); line-height: 1.55; margin: 0; font-size: 14px; }
    .tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 999px; background: var(--bg-secondary); }
    .tabs button { min-height: 42px; border: 0; border-radius: 999px; background: none; color: var(--text-muted); font: inherit; font-weight: 600; cursor: pointer; }
    .tabs button[aria-selected="true"] { background: var(--bg-primary); color: var(--text-primary); box-shadow: 0 1px 4px rgba(0,0,0,.18); }
    form { display: flex; flex-direction: column; gap: 12px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 420px) { .row { grid-template-columns: 1fr; } }
    label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; } label em { font-style: normal; font-weight: 400; color: var(--text-subtle); }
    input:not([type=checkbox]) { height: 46px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-secondary, transparent); color: var(--text-primary); padding: 0 12px; font: inherit; min-width: 0; width: 100%; box-sizing: border-box; }
    .pw { position: relative; display: block; } .pw input { padding-right: 86px; }
    .eye { position: absolute; right: 6px; top: 6px; height: 34px; padding: 0 10px; border-radius: 8px; border: 0; background: none; color: var(--text-muted); font: inherit; font-size: 13px; cursor: pointer; }
    .hint { color: var(--text-subtle); font-size: 12.5px; margin-top: -6px; }
    .check { flex-direction: row; gap: 10px; align-items: flex-start; font-weight: 400; font-size: 14px; line-height: 1.45; cursor: pointer; }
    .check input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--accent); flex: none; }
    a { color: var(--accent-ink); }
    .err { color: var(--danger); font-size: 14px; margin: 0; }
    .primary { min-height: 50px; border-radius: 999px; border: 0; background: var(--accent); color: var(--on-accent, #111); font: inherit; font-weight: 700; cursor: pointer; }
    .primary:disabled { opacity: .6; cursor: progress; }
    .muted { color: var(--text-muted); line-height: 1.5; margin: 0; } .small { font-size: 13px; }
    button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
    @media (prefers-reduced-motion: reduce) { .hero { animation: none; } }
  `]
})
export class CrewJoinComponent implements OnInit {
  private readonly api = inject(FicheService);
  private readonly tokens = inject(TokenService);
  private readonly router = inject(Router);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  readonly loading = signal(true);
  readonly pv = signal<CrewPreview | null>(null);
  readonly gone = signal('');
  readonly mode = signal<'creation' | 'connexion'>('creation');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly show = signal(false);
  firstName = ''; lastName = ''; email = ''; password = ''; phone = ''; city = ''; accept = false;

  ngOnInit(): void {
    this.api.crewPreview(this.token).subscribe({
      next: p => {
        this.pv.set(p); this.loading.set(false);
        this.email = p.email ?? '';
        if (p.name) { const [f, ...l] = p.name.split(' '); this.firstName = f; this.lastName = l.join(' '); }
      },
      error: (e: HttpErrorResponse) => { this.loading.set(false); this.gone.set(e.error?.message || 'Ce lien n’est plus valable. Demandez un nouveau lien au producer.'); }
    });
  }

  setMode(m: 'creation' | 'connexion'): void { this.mode.set(m); this.error.set(''); }

  submit(): void {
    this.error.set('');
    const creating = this.mode() === 'creation';
    if (!this.email.trim() || !this.password) { this.error.set('Indiquez votre adresse e-mail et votre mot de passe.'); return; }
    if (creating && (!this.firstName.trim() || !this.lastName.trim())) { this.error.set('Indiquez votre prénom et votre nom.'); return; }
    if (creating && this.password.length < 8) { this.error.set('Mot de passe : 8 caractères au moins.'); return; }
    if (creating && !this.accept) { this.error.set('Acceptez les conditions pour créer votre compte.'); return; }
    this.busy.set(true);
    this.api.crewJoin(this.token, {
      mode: this.mode(), email: this.email.trim(), password: this.password, firstName: this.firstName.trim(), lastName: this.lastName.trim(),
      phone: this.phone.trim() || null, city: this.city.trim() || null, acceptTerms: creating ? this.accept : null
    }).subscribe({
      next: r => { this.tokens.setTokens(r.accessToken, r.refreshToken, r.role); this.router.navigateByUrl('/demandes/' + this.pv()!.requestId + '#etape-production'); },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(e.status === 401 ? 'Mot de passe incorrect pour ce compte.' : e.error?.message || 'Impossible de rejoindre le poste. Réessayez.');
      }
    });
  }
}
