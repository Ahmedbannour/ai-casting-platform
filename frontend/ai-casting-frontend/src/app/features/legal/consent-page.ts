import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ConsentService } from './consent.service';
import { AuthService } from '../../core/services/auth.service';
import { LEGAL_VERSION_LABEL } from './legal-page';

/** T-101 · Accord demandé à la connexion quand il manque ou quand les textes ont changé. */
@Component({
  selector: 'app-consent-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
  <main class="gate">
    <h1>Avant de continuer</h1>
    <p class="lead">Nos conditions d'utilisation et notre politique de confidentialité (version du {{ version }}) précisent ce que la plateforme fait de vos données et qui peut voir votre profil. Votre accord est nécessaire pour utiliser Cercle.</p>
    <p class="docs"><a routerLink="/legal/conditions" target="_blank">Lire les conditions d'utilisation</a><a routerLink="/legal/confidentialite" target="_blank">Lire la politique de confidentialité</a></p>

    <fieldset>
      <legend>Votre âge</legend>
      <div class="seg" role="radiogroup" aria-label="Votre âge">
        <button type="button" role="radio" [attr.aria-checked]="age() === 'MAJEUR'" [class.on]="age() === 'MAJEUR'" (click)="age.set('MAJEUR'); error.set('')">18 ans ou plus</button>
        <button type="button" role="radio" [attr.aria-checked]="age() === 'MINEUR'" [class.on]="age() === 'MINEUR'" (click)="age.set('MINEUR'); error.set('')">Moins de 18 ans</button>
      </div>
    </fieldset>
    @if (age() === 'MINEUR') {
      <label class="txt" for="g">Nom du parent ou représentant légal qui donne son accord</label>
      <input id="g" class="in" [(ngModel)]="guardian" maxlength="120" placeholder="Prénom et nom" />
    }
    <label class="check"><input type="checkbox" [(ngModel)]="accept" (change)="error.set('')" /><span>J'accepte les conditions d'utilisation et la politique de confidentialité.</span></label>

    @if (error()) { <div class="err" role="alert">{{ error() }}</div> }
    <div class="actions">
      <button type="button" class="primary" [disabled]="busy()" (click)="submit()">{{ busy() ? 'Enregistrement…' : 'Continuer' }}</button>
      <button type="button" class="ghost" (click)="logout()">Se déconnecter</button>
    </div>
  </main>`,
  styles: [`
    :host { display: grid; place-items: center; min-height: 100vh; background: var(--bg-primary); color: var(--text-primary); padding: 24px 16px; }
    .gate { width: 100%; max-width: 520px; background: var(--bg-card, var(--bg-secondary)); border: 1px solid var(--border); border-radius: 18px; padding: 30px 28px; }
    h1 { font-size: 26px; margin: 0 0 10px; }
    .lead { color: var(--text-muted); line-height: 1.55; margin: 0 0 12px; }
    .docs { display: flex; flex-wrap: wrap; gap: 14px; margin: 0 0 20px; font-size: 14px; }
    a { color: var(--accent-ink); }
    fieldset { border: 0; padding: 0; margin: 0 0 14px; }
    legend { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .seg button { height: 42px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--text-primary); font: inherit; font-size: 14px; cursor: pointer; }
    .seg button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); font-weight: 600; }
    .txt { display: block; font-size: 13px; font-weight: 600; margin: 4px 0 6px; }
    .in { width: 100%; box-sizing: border-box; height: 42px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); padding: 0 12px; font: inherit; margin-bottom: 14px; }
    .check { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.45; cursor: pointer; margin: 4px 0 16px; }
    .check input { width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--accent); flex: none; }
    .err { color: var(--danger); font-size: 14px; margin-bottom: 12px; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .primary { flex: 1; height: 44px; border-radius: 999px; border: 0; background: var(--accent); color: var(--accent-contrast, #111); font: inherit; font-weight: 600; cursor: pointer; }
    .primary:disabled { opacity: .6; cursor: progress; }
    .ghost { height: 44px; padding: 0 18px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font: inherit; cursor: pointer; }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  `]
})
export class ConsentPageComponent {
  private consent = inject(ConsentService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  readonly version = LEGAL_VERSION_LABEL;
  readonly age = signal<'MAJEUR' | 'MINEUR' | ''>('');
  readonly busy = signal(false);
  readonly error = signal('');
  accept = false;
  guardian = '';

  submit(): void {
    if (!this.age()) { this.error.set('Indiquez votre âge.'); return; }
    if (this.age() === 'MINEUR' && !this.guardian.trim()) { this.error.set('Indiquez le nom du parent ou représentant légal.'); return; }
    if (!this.accept) { this.error.set('Cochez la case pour continuer.'); return; }
    this.error.set(''); this.busy.set(true);
    this.consent.accept({ accept: true, age: this.age() as 'MAJEUR' | 'MINEUR', guardianName: this.age() === 'MINEUR' ? this.guardian.trim() : undefined })
      .subscribe({
        next: () => {
          const suite = this.route.snapshot.queryParamMap.get('suite');
          this.router.navigateByUrl(suite && suite.startsWith('/') && !suite.startsWith('//') ? suite : this.auth.homeFor());
        },
        error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Enregistrement impossible. Réessayez.'); }
      });
  }

  logout(): void { this.consent.reset(); this.auth.logout(); this.router.navigateByUrl('/auth/login'); }
}
