import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ShareRow, ShareService } from '../../core/services/share.service';
import { SelectFieldComponent } from '../../shared/components/select-field/select-field';
import { frDate } from '../../shared/forms/dates';

/** Liens envoyés au réalisateur pour un rôle : création, copie, retrait. */
@Component({
  selector: 'app-share-panel',
  standalone: true,
  imports: [FormsModule, SelectFieldComponent],
  template: `
  <div class="backdrop" (click)="close.emit()"></div>
  <section class="panel" role="dialog" aria-modal="true" aria-labelledby="sp-title" (keydown.escape)="close.emit()">
    <header>
      <h2 id="sp-title">Envoyer au réalisateur</h2>
      <button type="button" class="x" (click)="close.emit()" aria-label="Fermer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </header>
    <p class="lead">Le réalisateur ouvre le lien sans créer de compte. Il voit les candidats de « {{ roleName() }} », sans téléphone ni e-mail, et répond oui, peut-être ou non pour chacun.</p>

    <form class="new" (ngSubmit)="create()" novalidate>
      <div class="f grow">
        <label for="sp-label">Pour qui</label>
        <input id="sp-label" name="label" [(ngModel)]="label" maxlength="80" placeholder="Ex. Claire Martin, réalisatrice" autocomplete="off" />
      </div>
      <div class="f">
        <label for="sp-days">Valable</label>
        <app-select inputId="sp-days" name="days" [options]="dayOptions" [(ngModel)]="days" ariaLabel="Durée de validité" />
      </div>
      <button type="submit" class="btn-primary" [disabled]="busy()">Créer le lien</button>
    </form>
    @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

    <h3>Liens envoyés</h3>
    @if (loading()) {
      <div class="skel"></div>
    } @else {
      <ul class="links">
        @for (s of shares(); track s.id) {
          <li [class.off]="!s.active">
            <div class="l-main">
              <b>{{ s.label || 'Lien sans nom' }}</b>
              <span class="l-sub">
                @if (s.active) { Valable jusqu'au {{ frDate(s.expiresAt.slice(0, 10)) }} } @else { Retiré ou expiré }
              </span>
              <span class="tally">
                <span class="v oui">{{ s.oui }} oui</span><span class="v pe">{{ s.peutEtre }} peut-être</span><span class="v non">{{ s.non }} non</span>
              </span>
            </div>
            @if (s.active) {
              <div class="l-actions">
                <button type="button" class="btn-ghost" (click)="copy(s)">{{ copied() === s.id ? 'Lien copié' : 'Copier le lien' }}</button>
                @if (confirmRevoke() === s.id) {
                  <button type="button" class="btn-danger" (click)="revoke(s)">Retirer l'accès</button>
                  <button type="button" class="btn-ghost" (click)="confirmRevoke.set(null)">Garder</button>
                } @else {
                  <button type="button" class="btn-ghost" (click)="confirmRevoke.set(s.id)">Retirer</button>
                }
              </div>
            }
          </li>
        } @empty {
          <li class="none">Aucun lien pour l'instant. Créez-en un et envoyez-le par le canal de votre choix.</li>
        }
      </ul>
    }
  </section>
  `,
  styles: [`
  :host { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 20px; }
  .backdrop { position: absolute; inset: 0; background: rgba(10,10,12,.55); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); animation: fade .2s both; }
  .panel { position: relative; width: min(640px, 100%); max-height: calc(100vh - 40px); overflow: auto; display: flex; flex-direction: column; gap: 14px;
    padding: 24px; border-radius: var(--radius-l); border: 1px solid var(--border); background: var(--glass-strong);
    -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); box-shadow: 0 30px 80px rgba(0,0,0,.4); animation: pop .32s cubic-bezier(.2,.8,.2,1) both; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h2 { font-size: 26px; }
  h3 { font-size: 15px; font-weight: 600; font-stretch: 100%; margin-top: 4px; }
  .x { width: 34px; height: 34px; display: grid; place-items: center; border: none; border-radius: 8px; background: none; color: var(--text-muted); cursor: pointer;
    &:hover { background: var(--bg-hover); color: var(--text-primary); } }
  .lead { color: var(--text-muted); line-height: 1.55; font-size: 14px; }
  .new { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
  .f { display: flex; flex-direction: column; gap: 6px; min-width: 130px; label { font-size: 13px; color: var(--text-muted); } }
  .f input { height: 40px; padding: 0 12px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--glass); color: var(--text-primary); font: inherit; font-size: 14px; outline: none; transition: border-color .15s, box-shadow .15s;
    &:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); } }
  .grow { flex: 1; min-width: 220px; }
  .btn-primary, .btn-ghost, .btn-danger { display: inline-flex; align-items: center; height: 40px; padding: 0 16px; border-radius: var(--radius-s); font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .btn-primary { border: none; background: var(--accent); color: var(--on-accent); &:hover { background: var(--accent-hover); } &:disabled { opacity: .6; cursor: default; } }
  .btn-ghost { border: 1px solid var(--border); background: var(--glass); color: var(--text-primary); font-weight: 500; height: 34px; padding: 0 12px; font-size: 13px; &:hover { background: var(--bg-hover); } }
  .btn-danger { border: none; background: var(--danger); color: #fff; height: 34px; padding: 0 12px; font-size: 13px; }
  .err { color: var(--danger); font-size: 14px; }
  .links { list-style: none; display: flex; flex-direction: column; gap: 8px; padding: 0; margin: 0; }
  .links li { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 14px;
    border-radius: var(--radius-m); border: 1px solid var(--border); background: var(--bg-surface); }
  .links li.off { opacity: .55; }
  .links li.none { color: var(--text-muted); font-size: 14px; border-style: dashed; background: none; }
  .l-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .l-sub { font-size: 12.5px; color: var(--text-muted); }
  .tally { display: flex; gap: 10px; font-size: 12.5px; margin-top: 2px; }
  .v { display: inline-flex; align-items: center; gap: 5px; color: var(--text-muted); &::before { content: ''; width: 7px; height: 7px; border-radius: 50%; } }
  .v.oui::before { background: var(--series-3); } .v.pe::before { background: var(--series-2); } .v.non::before { background: var(--text-subtle); }
  .l-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .skel { height: 70px; border-radius: var(--radius-m); background: var(--bg-hover); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: translateY(16px) scale(.97); } }
  @media (max-width: 560px) { :host { padding: 10px; } .panel { padding: 18px; } .new .btn-primary { width: 100%; justify-content: center; } }
  `]
})
export class SharePanelComponent implements OnInit {
  private readonly api = inject(ShareService);
  readonly roleId = input.required<string>();
  readonly roleName = input('');
  readonly close = output<void>();

  readonly frDate = frDate;
  readonly dayOptions = [
    { value: 3, label: '3 jours' }, { value: 7, label: '7 jours' }, { value: 14, label: '14 jours' },
    { value: 30, label: '30 jours' }, { value: 90, label: '90 jours' }
  ];
  readonly shares = signal<ShareRow[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly copied = signal<string | null>(null);
  readonly confirmRevoke = signal<string | null>(null);
  label = '';
  days = 14;

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.api.list(this.roleId()).subscribe({
      next: s => { this.shares.set(s); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger les liens. Réessayez.'); }
    });
  }

  create(): void {
    this.busy.set(true);
    this.error.set('');
    this.api.create(this.roleId(), this.label.trim(), this.days).subscribe({
      next: s => { this.busy.set(false); this.label = ''; this.shares.update(l => [s, ...l]); this.copy(s); },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(e.error?.code === 'CONTRAT_INACTIF' ? 'Votre contrat n’est pas actif : création impossible.' : (e.error?.message ?? 'Création impossible. Réessayez.'));
      }
    });
  }

  copy(s: ShareRow): void {
    const url = this.api.link(s.token);
    navigator.clipboard?.writeText(url).then(() => {
      this.copied.set(s.id);
      setTimeout(() => this.copied() === s.id && this.copied.set(null), 2500);
    }).catch(() => this.error.set('Copie impossible. Adresse : ' + url));
  }

  revoke(s: ShareRow): void {
    this.confirmRevoke.set(null);
    this.api.revoke(s.id).subscribe({ next: () => this.load(), error: () => this.error.set('Retrait impossible. Réessayez.') });
  }
}
