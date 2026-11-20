import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { EMAIL_RE } from '../../shared/forms/rules';

type ProRole = 'MARQUE' | 'AGENCE_MARKETING' | 'REALISATEUR' | 'BOITE_PROD';

/** T-157 · Cahier v2 : inscription d'un professionnel ; le compte s'ouvre après validation par l'administrateur. */
@Component({
  selector: 'app-inscription-pro',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
  <main class="pro">
    <a class="logo" routerLink="/" aria-label="AI Casting, accueil"><span class="brand-mark" aria-hidden="true"></span>AI Casting</a>
    @if (sent()) {
      <section class="card done" role="status">
        <h1>Demande envoyée</h1>
        <p>{{ sent() }}</p>
        <p class="small">Adresse : <b>{{ email }}</b></p>
        <a class="send" routerLink="/auth/login">Retour à la connexion</a>
      </section>
    } @else {
      <form class="card" (ngSubmit)="submit()" novalidate>
        <h1>Créer un compte professionnel</h1>
        <p class="lead">Marques, agences, réalisateurs et boîtes de production. L'équipe AI Casting valide chaque compte avant son ouverture.</p>

        <fieldset class="roles">
          <legend>Votre métier</legend>
          @for (r of roles; track r.value) {
            <label class="role" [class.on]="role === r.value">
              <input type="radio" name="role" [value]="r.value" [(ngModel)]="role" />
              <span><b>{{ r.label }}</b><small>{{ r.hint }}</small></span>
            </label>
          }
          @if (err('role'); as m) { <small class="msg">{{ m }}</small> }
        </fieldset>

        <div class="grid">
          <label class="f"><span>Prénom</span><input name="first" [(ngModel)]="firstName" maxlength="80" autocomplete="given-name" />
            @if (err('firstName'); as m) { <small class="msg">{{ m }}</small> }</label>
          <label class="f"><span>Nom</span><input name="last" [(ngModel)]="lastName" maxlength="80" autocomplete="family-name" />
            @if (err('lastName'); as m) { <small class="msg">{{ m }}</small> }</label>
          <label class="f"><span>{{ role === 'REALISATEUR' ? 'Société de production (facultatif)' : orgLabel() }}</span>
            <input name="org" [(ngModel)]="organisation" maxlength="160" [placeholder]="role === 'REALISATEUR' ? 'Vide si vous êtes indépendant' : 'Nom de l’organisation'" />
            @if (err('organisation'); as m) { <small class="msg">{{ m }}</small> }</label>
          <label class="f"><span>Ville</span><input name="city" [(ngModel)]="city" maxlength="100" placeholder="Tunis" /></label>
          <label class="f wide"><span>E-mail professionnel</span><input name="email" type="email" [(ngModel)]="email" autocomplete="email" inputmode="email" />
            @if (err('email'); as m) { <small class="msg">{{ m }}</small> }</label>
          <label class="f wide"><span>Mot de passe</span><input name="pw" type="password" [(ngModel)]="password" autocomplete="new-password" />
            @if (err('password'); as m) { <small class="msg">{{ m }}</small> }</label>
        </div>

        <label class="consent"><input type="checkbox" name="terms" [(ngModel)]="accept" />
          <span>J'accepte les <a routerLink="/legal/conditions" target="_blank">conditions d'utilisation</a> et la <a routerLink="/legal/confidentialite" target="_blank">politique de confidentialité</a>.</span></label>
        @if (err('accept'); as m) { <small class="msg">{{ m }}</small> }

        @if (error()) { <p class="msg big" role="alert">{{ error() }}</p> }
        <button type="submit" class="send" [disabled]="busy()">{{ busy() ? 'Envoi…' : 'Envoyer ma demande' }}</button>
        <p class="small">Déjà un compte ? <a routerLink="/auth/login">Se connecter</a> · Acteur ou actrice ? <a routerLink="/auth/inscription">Créer votre profil</a></p>
      </form>
    }
  </main>`,
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--bg-primary); color: var(--text-primary); }
    .pro { max-width: 640px; margin: 0 auto; padding: 32px 18px 64px; display: flex; flex-direction: column; gap: 24px; }
    .logo { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; color: var(--text-primary); text-decoration: none; }
    .card { padding: 28px; border-radius: 18px; border: 1px solid var(--border); background: var(--glass, transparent); display: flex; flex-direction: column; gap: 14px; }
    h1 { margin: 0; font-size: 30px; line-height: 1.1; }
    .lead, .small { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.5; }
    .roles { border: 0; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    legend { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--text-muted); }
    .role { display: flex; gap: 10px; padding: 12px; border-radius: 12px; border: 1px solid var(--border); cursor: pointer; transition: border-color .15s, background .15s; }
    .role.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
    .role input { margin-top: 3px; accent-color: var(--accent); }
    .role b { display: block; font-size: 14px; } .role small { display: block; margin-top: 2px; font-size: 12.5px; color: var(--text-muted); line-height: 1.35; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .f { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; } .f.wide { grid-column: 1 / -1; }
    .f input { height: 44px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-surface, transparent); color: var(--text-primary); padding: 0 12px; font: inherit; font-weight: 400; font-size: 14px; }
    .consent { display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; color: var(--text-muted); } .consent input { margin-top: 2px; accent-color: var(--accent); }
    .msg { color: var(--danger); font-size: 12.5px; font-weight: 500; } .msg.big { font-size: 14px; margin: 0; }
    .send { align-self: flex-start; display: inline-flex; align-items: center; height: 46px; padding: 0 22px; border-radius: 12px; border: 0; background: var(--accent); color: #111;
      font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; text-decoration: none; }
    .send:disabled { opacity: .6; cursor: progress; }
    a { color: var(--accent-ink); }
    @media (max-width: 560px) { .roles, .grid { grid-template-columns: 1fr; } .card { padding: 20px; } h1 { font-size: 26px; } }
  `]
})
export class InscriptionProComponent {
  private readonly auth = inject(AuthService);
  readonly roles: { value: ProRole; label: string; hint: string }[] = [
    { value: 'MARQUE', label: 'Marque', hint: 'Vous déposez l’idée de votre publicité (V0).' },
    { value: 'AGENCE_MARKETING', label: 'Agence marketing', hint: 'Vous transformez l’idée en concept (V1).' },
    { value: 'REALISATEUR', label: 'Réalisateur ou 1er AD', hint: 'Vous écrivez la V2 et l’intention de chaque rôle.' },
    { value: 'BOITE_PROD', label: 'Boîte de production', hint: 'Vous organisez le casting et la PPM.' }
  ];
  role: ProRole | '' = '';
  organisation = ''; city = ''; firstName = ''; lastName = ''; email = ''; password = ''; accept = false;
  readonly tried = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly sent = signal('');

  orgLabel(): string {
    return this.role === 'MARQUE' ? 'Nom de la marque' : this.role === 'AGENCE_MARKETING' ? 'Nom de l’agence' : this.role === 'BOITE_PROD' ? 'Nom de la boîte de production' : 'Organisation';
  }

  err(f: string): string {
    if (!this.tried()) return '';
    switch (f) {
      case 'role': return this.role ? '' : 'Choisissez votre métier.';
      case 'organisation': return this.role && this.role !== 'REALISATEUR' && !this.organisation.trim() ? 'Indiquez le nom de votre organisation.' : '';
      case 'firstName': return this.firstName.trim() ? '' : 'Champ obligatoire.';
      case 'lastName': return this.lastName.trim() ? '' : 'Champ obligatoire.';
      case 'email': return !this.email.trim() ? 'Champ obligatoire.' : EMAIL_RE.test(this.email.trim()) ? '' : 'Adresse e-mail incomplète (ex. nom@societe.tn).';
      case 'password': return this.password.length >= 8 ? '' : '8 caractères au moins.';
      case 'accept': return this.accept ? '' : 'Cochez la case pour envoyer votre demande.';
    }
    return '';
  }

  submit(): void {
    this.tried.set(true); this.error.set('');
    if (['role', 'organisation', 'firstName', 'lastName', 'email', 'password', 'accept'].some(f => this.err(f))) return;
    this.busy.set(true);
    this.auth.registerPro({ role: this.role, firstName: this.firstName.trim(), lastName: this.lastName.trim(), email: this.email.trim(),
      password: this.password, organisation: this.organisation.trim() || null, city: this.city.trim() || null, acceptTerms: this.accept })
      .subscribe({
        next: r => { this.busy.set(false); this.sent.set(r.message); },
        error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.status === 0 ? 'Serveur injoignable. Réessayez dans un instant.' : e.error?.message ?? 'Envoi impossible. Réessayez.'); }
      });
  }
}
