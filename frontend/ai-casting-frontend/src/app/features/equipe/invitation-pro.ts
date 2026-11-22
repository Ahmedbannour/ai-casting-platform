import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ProInvitationPreview, ProductionService } from '../../core/services/production.service';
import { TokenService } from '../../core/services/token.service';
import { AuthService } from '../../core/services/auth.service';
import { PERMS } from '../../core/roles';
import { FormStepsComponent } from '../../shared/components/form-steps/form-steps';

/**
 * Lien d'invitation du producer : la marque, l'agence marketing ou l'assistante de production crée son compte
 * en deux ou trois étapes courtes, puis arrive directement sur le projet.
 */
@Component({
  selector: 'app-invitation-pro',
  standalone: true,
  imports: [FormsModule, RouterLink, FormStepsComponent],
  template: `
  <main class="inv">
    <p class="brand wordmark">Cercle</p>
    @if (loading()) { <p class="muted">Ouverture de votre invitation…</p> }
    @else if (!pv()) {
      <h1>Lien plus valable</h1>
      <p class="muted">{{ gone() }}</p>
      <p><a routerLink="/auth/login">Aller à la connexion</a></p>
    } @else {
      @let p = pv()!;
      <div class="hero">
        <span class="ring" aria-hidden="true"><i></i><i></i><i></i></span>
        <small>{{ p.inviterName ? p.inviterName + ' · ' : '' }}{{ p.productionName }}</small>
        <h1>{{ headline() }}</h1>
        <p class="lead">{{ lead() }}</p>
        @if (p.kind === 'ASSISTANT_PROD' && p.perms.length) {
          <ul class="perms">@for (x of permLabels(); track x) { <li>{{ x }}</li> }</ul>
        }
      </div>

      <app-form-steps [labels]="labels()" [current]="step()" [reached]="reached()" (go)="go($event)" />
      <form (ngSubmit)="next()" (input)="error.set('')" novalidate>
        @switch (stepKey()) {
          @case ('vous') {
            <div class="form-step" [class.back]="back()">
              <label for="fn">Prénom</label>
              <input id="fn" name="fn" [(ngModel)]="firstName" autocomplete="given-name" maxlength="80" />
              <label for="ln">Nom</label>
              <input id="ln" name="ln" [(ngModel)]="lastName" autocomplete="family-name" maxlength="80" />
            </div>
          }
          @case ('org') {
            <div class="form-step" [class.back]="back()">
              <label for="org">{{ p.kind === 'MARQUE' ? 'Nom de votre marque' : 'Nom de votre agence' }}</label>
              <input id="org" name="org" [(ngModel)]="organisation" autocomplete="organization" maxlength="160" />
              <label for="city">Ville <em>facultatif</em></label>
              <input id="city" name="city" [(ngModel)]="city" autocomplete="address-level2" maxlength="100" />
            </div>
          }
          @case ('acces') {
            <div class="form-step" [class.back]="back()">
              <label for="em">Adresse e-mail</label>
              <input id="em" name="em" [value]="p.email" readonly class="ro" />
              <label for="pw">Mot de passe</label>
              <input id="pw" name="pw" type="password" [(ngModel)]="password" autocomplete="new-password" placeholder="8 caractères au moins" />
              <label class="check"><input type="checkbox" name="ok" [(ngModel)]="accept" />
                <span>J'accepte les <a routerLink="/legal/conditions" target="_blank">conditions d'utilisation</a> et la <a routerLink="/legal/confidentialite" target="_blank">politique de confidentialité</a>.</span></label>
            </div>
          }
        }
        @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
        <div class="nav">
          @if (step() > 0) { <button type="button" class="ghost" (click)="go(step() - 1)">Précédent</button> }
          <button type="submit" class="primary" [disabled]="busy()">
            {{ last() ? (busy() ? 'Création du compte…' : 'Rejoindre le projet') : 'Suivant' }}</button>
        </div>
      </form>
      <p class="muted small">Lien valable jusqu'au {{ day(p.expiresAt) }}, une seule fois. Déjà un compte ? <a routerLink="/auth/login">Se connecter</a></p>
    }
  </main>`,
  styles: [`
    :host { display: grid; place-items: start center; min-height: 100vh; background: var(--bg-primary); color: var(--text-primary); padding: 36px 16px; }
    .inv { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 16px; }
    .brand { font-weight: 800; font-size: 22px; color: var(--accent-ink); margin: 0; }
    .hero { position: relative; padding: 22px 20px 20px; border-radius: 20px; border: 1px solid var(--border); background: var(--glass); overflow: hidden;
      animation: rise .45s cubic-bezier(.2,.8,.2,1) both; }
    .hero small { color: var(--text-subtle); font-size: 12.5px; font-weight: 600; }
    .hero h1 { font-size: 27px; line-height: 1.15; margin: 6px 0 8px; max-width: 18ch; }
    .lead { color: var(--text-muted); line-height: 1.55; margin: 0; font-size: 14.5px; }
    .ring { position: absolute; right: -36px; top: -36px; width: 140px; height: 140px; pointer-events: none; }
    .ring i { position: absolute; inset: 0; border-radius: 50%; border: 2px solid var(--accent); opacity: .35; animation: ripple 3.2s ease-out infinite; }
    .ring i:nth-child(2) { animation-delay: 1.05s; } .ring i:nth-child(3) { animation-delay: 2.1s; }
    .perms { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .perms li { padding: 5px 10px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--text-primary); font-size: 12.5px; font-weight: 600; }
    form { display: flex; flex-direction: column; }
    .form-step { display: flex; flex-direction: column; }
    label { font-size: 13px; font-weight: 600; margin: 0 0 6px; } label em { font-style: normal; font-weight: 400; color: var(--text-subtle); }
    input:not([type=checkbox]) { height: 44px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-secondary, transparent);
      color: var(--text-primary); padding: 0 12px; font: inherit; margin-bottom: 14px; min-width: 0; }
    input.ro { color: var(--text-muted); }
    .check { display: flex; gap: 10px; align-items: flex-start; font-weight: 400; font-size: 14px; line-height: 1.45; margin: 2px 0 14px; cursor: pointer; }
    .check input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--accent); flex: none; }
    a { color: var(--accent-ink); }
    .err { color: var(--danger); font-size: 14px; margin: 0 0 12px; }
    .nav { display: flex; gap: 10px; }
    .primary { flex: 1; height: 48px; border-radius: 999px; border: 0; background: var(--accent); color: var(--on-accent, #111); font: inherit; font-weight: 700; cursor: pointer; transition: transform .15s; }
    .primary:active { transform: scale(.98); }
    .primary:disabled { opacity: .6; cursor: progress; }
    .ghost { height: 48px; padding: 0 18px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--text-primary); font: inherit; font-weight: 600; cursor: pointer; }
    .muted { color: var(--text-muted); line-height: 1.5; margin: 0; } .small { font-size: 13px; }
    button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
    @keyframes ripple { from { transform: scale(.35); opacity: .55; } to { transform: scale(1.15); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .hero, .ring i { animation: none; } }
  `]
})
export class InvitationProComponent implements OnInit {
  private readonly api = inject(ProductionService);
  private readonly tokens = inject(TokenService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  readonly loading = signal(true);
  readonly pv = signal<ProInvitationPreview | null>(null);
  readonly gone = signal('');
  readonly step = signal(0);
  readonly back = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  firstName = ''; lastName = ''; organisation = ''; city = ''; password = ''; accept = false;

  readonly keys = computed(() => this.pv()?.needsOrg ? ['vous', 'org', 'acces'] : ['vous', 'acces']);
  readonly labels = computed(() => this.keys().map(k => k === 'vous' ? 'Vous' : k === 'org' ? (this.pv()?.kind === 'MARQUE' ? 'Votre marque' : 'Votre agence') : 'Votre accès'));
  readonly stepKey = computed(() => this.keys()[this.step()]);
  readonly last = computed(() => this.step() === this.keys().length - 1);
  readonly reached = signal(0);

  readonly headline = computed(() => {
    const p = this.pv(); if (!p) return '';
    if (p.roomId) return 'Vous êtes attendu dans la room de casting';
    return p.kind === 'ASSISTANT_PROD' ? 'Rejoignez l’équipe de production'
      : p.kind === 'MARQUE' ? 'Votre publicité commence ici' : 'Une marque compte sur votre concept';
  });
  readonly lead = computed(() => {
    const p = this.pv(); if (!p) return '';
    const t = p.requestTitle ? `« ${p.requestTitle} »` : 'ce projet';
    if (p.roomId) return `${p.inviterName ?? p.productionName} vous invite dans la room ${t}${p.joinOrg ? ' avec ' + p.joinOrg : ''} : vous y découvrirez les candidats de chaque rôle et donnerez votre avis d’un geste.`;
    if (p.kind === 'ASSISTANT_PROD') return `${p.productionName} vous invite comme assistante de production. Voici ce que vous pourrez faire :`;
    if (p.kind === 'MARQUE') return `${p.productionName} vous invite sur ${t}${p.joinOrg ? ' avec ' + p.joinOrg : ''}. Créez votre compte, puis déposez votre V0 : le brief de votre idée.`;
    return `${p.productionName} vous invite sur ${t}${p.joinOrg ? ' avec ' + p.joinOrg : ''}. Vous recevrez la V0 de la marque pour préparer la V1, le concept.`;
  });
  readonly permLabels = computed(() => PERMS.filter(x => this.pv()?.perms.includes(x.key)).map(x => x.label));

  ngOnInit(): void {
    this.api.preview(this.token).subscribe({
      next: p => { this.pv.set(p); this.loading.set(false); },
      error: (e: HttpErrorResponse) => {
        this.gone.set(e.status === 0 ? 'Serveur injoignable. Réessayez dans un instant.'
          : e.error?.message ?? 'Ce lien a déjà servi, a expiré ou a été remplacé. Demandez un nouveau lien au producer.');
        this.loading.set(false);
      }
    });
  }

  go(i: number): void {
    if (i > this.step() && !this.valid()) return;
    if (i < 0 || i >= this.keys().length) return;
    this.back.set(i < this.step());
    this.step.set(i);
    this.reached.update(r => Math.max(r, i));
    this.error.set('');
  }

  next(): void {
    if (!this.valid()) return;
    if (!this.last()) { this.go(this.step() + 1); return; }
    this.busy.set(true);
    this.api.accept(this.token, {
      firstName: this.firstName.trim(), lastName: this.lastName.trim(), organisation: this.organisation.trim() || null,
      city: this.city.trim() || null, password: this.password, acceptTerms: true
    }).subscribe({
      next: r => { this.tokens.setTokens(r.accessToken, r.refreshToken, r.role); const room = this.pv()?.roomId; this.router.navigateByUrl(room ? '/rooms/' + room : this.auth.homeFor(r.role)); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Création du compte impossible. Réessayez.'); }
    });
  }

  /** Vérifie l'étape en cours ; le message dit quoi corriger. */
  private valid(): boolean {
    const k = this.stepKey();
    const err = k === 'vous' ? (!this.firstName.trim() ? 'Indiquez votre prénom.' : !this.lastName.trim() ? 'Indiquez votre nom.' : '')
      : k === 'org' ? (!this.organisation.trim() ? (this.pv()?.kind === 'MARQUE' ? 'Indiquez le nom de votre marque.' : 'Indiquez le nom de votre agence.') : '')
      : this.password.length < 8 ? 'Choisissez un mot de passe de 8 caractères au moins.'
      : !this.accept ? 'Cochez la case pour créer votre compte.' : '';
    this.error.set(err);
    return !err;
  }

  day(ms: number): string { return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
}
