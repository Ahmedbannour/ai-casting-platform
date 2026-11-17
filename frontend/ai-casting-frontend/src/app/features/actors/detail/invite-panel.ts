import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface InviteStatus { hasAccount: boolean; canInvite: boolean; pendingUntil: number | null; usedAt: number | null; reason: string | null; }

/**
 * T-102 · Invitation de l'acteur à reprendre sa fiche.
 * Le lien n'est affiché qu'à sa création (le serveur n'en garde que l'empreinte) ;
 * l'agent le copie et l'envoie lui-même (WhatsApp, SMS, e-mail).
 */
@Component({
  selector: 'app-invite-panel',
  standalone: true,
  template: `
  @if (st(); as s) {
    @if (s.hasAccount) {
      <p class="inv done"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
        L'acteur a son compte et tient lui-même sa fiche à jour.</p>
    } @else if (s.canInvite) {
      <section class="inv" aria-labelledby="inv-h">
        <div class="txt">
          <h3 id="inv-h">Inviter l'acteur à reprendre sa fiche</h3>
          @if (link()) {
            <p>Envoyez ce lien à l'acteur (WhatsApp, SMS ou e-mail). Il ne sert qu'une fois et reste valable jusqu'au {{ day(until()) }}.</p>
            <div class="link-row">
              <input type="text" readonly [value]="link()" aria-label="Lien d'invitation" (focus)="$any($event.target).select()" />
              <button type="button" class="btn-primary" (click)="copy()">{{ copied() ? 'Copié' : 'Copier le lien' }}</button>
            </div>
            <p class="small">Ce lien ne sera plus affiché ensuite : copiez-le maintenant. Un nouveau lien annule le précédent.</p>
          } @else if (s.pendingUntil) {
            <p>Un lien a déjà été créé ; il est valable jusqu'au {{ day(s.pendingUntil) }}. Si l'acteur ne l'a pas reçu, créez-en un nouveau : l'ancien ne marchera plus.</p>
          } @else {
            <p>L'acteur crée son compte, met à jour sa fiche et choisit s'il reste chez votre agence ou rejoint le vivier commun. Sans réponse, sa fiche reste privée chez vous.</p>
          }
          @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
        </div>
        <div class="btns">
          @if (!link()) {
            <button type="button" class="btn-primary" [disabled]="busy()" (click)="create()">{{ busy() ? 'Création…' : (s.pendingUntil ? 'Nouveau lien' : 'Créer le lien d\\'invitation') }}</button>
          }
          @if (link() || s.pendingUntil) {
            <button type="button" class="btn-ghost" [disabled]="busy()" (click)="revoke()">Annuler le lien</button>
          }
        </div>
      </section>
    }
  }`,
  styles: [`
    :host { display: block; }
    .inv { display: flex; gap: 16px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap;
      margin: 0 0 18px; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--radius-s, 10px); background: var(--bg-card, transparent); }
    .inv.done { display: flex; align-items: center; gap: 8px; padding: 10px 14px; font-size: 14px; color: var(--text-muted); }
    .inv.done svg { width: 18px; height: 18px; fill: none; stroke: var(--accent); stroke-width: 2; flex: none; }
    .txt { flex: 1 1 340px; min-width: 0; }
    h3 { margin: 0 0 4px; font-size: 15px; }
    p { margin: 0 0 6px; font-size: 14px; line-height: 1.5; color: var(--text-muted); }
    .small { font-size: 12.5px; }
    .err { color: var(--danger); }
    .link-row { display: flex; gap: 8px; margin: 8px 0 6px; flex-wrap: wrap; }
    .link-row input { flex: 1 1 240px; min-width: 0; height: 38px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg-primary); color: var(--text-primary); font: inherit; font-size: 13px; }
    .btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn-ghost, .btn-primary { display: inline-flex; align-items: center; height: 38px; padding: 0 14px; border-radius: 8px;
      font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .btn-primary { border: 0; background: var(--accent); color: var(--on-accent, #111); }
    .btn-primary:disabled, .btn-ghost:disabled { opacity: .55; cursor: progress; }
    .btn-ghost { border: 1px solid var(--border); background: transparent; color: var(--text-primary); font-weight: 500; }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  `]
})
export class InvitePanelComponent implements OnChanges {
  @Input({ required: true }) actorId!: string;
  private readonly http = inject(HttpClient);
  readonly st = signal<InviteStatus | null>(null);
  readonly link = signal('');
  readonly until = signal(0);
  readonly busy = signal(false);
  readonly copied = signal(false);
  readonly error = signal('');

  private get url() { return `${environment.apiUrl}/actors/${this.actorId}/invitation`; }

  ngOnChanges(): void { this.link.set(''); this.load(); }

  private load(): void {
    // Agence sans droit d'inviter (fiche du vivier) : le panneau reste masqué.
    this.http.get<InviteStatus>(this.url).subscribe({ next: s => this.st.set(s), error: () => this.st.set(null) });
  }

  create(): void {
    this.busy.set(true); this.error.set(''); this.copied.set(false);
    this.http.post<{ token: string; expiresAt: number }>(this.url, {}).subscribe({
      next: r => { this.busy.set(false); this.link.set(`${location.origin}/invitation/${r.token}`); this.until.set(r.expiresAt); this.load(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Création du lien impossible. Réessayez.'); }
    });
  }

  revoke(): void {
    this.busy.set(true); this.error.set('');
    this.http.delete(this.url).subscribe({
      next: () => { this.busy.set(false); this.link.set(''); this.load(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Annulation impossible. Réessayez.'); }
    });
  }

  copy(): void {
    navigator.clipboard?.writeText(this.link()).then(() => { this.copied.set(true); setTimeout(() => this.copied.set(false), 2500); },
      () => this.error.set('Copie impossible : sélectionnez le lien et copiez-le à la main.'));
  }

  day(ms: number): string {
    return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
