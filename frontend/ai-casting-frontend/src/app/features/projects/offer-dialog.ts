import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { OfferKind, OfferRow, OfferService } from '../../core/services/offer.service';
import { DateFieldComponent } from '../../shared/components/date-field/date-field';
import { todayIso } from '../../shared/forms/dates';

/** L'agent propose le rôle ou convoque l'acteur à une audition (T-095). */
@Component({
  selector: 'app-offer-dialog',
  standalone: true,
  imports: [FormsModule, DateFieldComponent],
  template: `
  <div class="backdrop" (click)="close.emit()"></div>
  <form class="panel" role="dialog" aria-modal="true" aria-labelledby="od-t" (ngSubmit)="send()" (keydown.escape)="onEscape($event)" novalidate>
    <h2 id="od-t">Contacter {{ actorName() }}</h2>
    <p class="lead">L'acteur reçoit la demande dans son espace et répond en un clic. Vous voyez sa réponse sur sa carte.</p>

    <div class="seg" role="radiogroup" aria-label="Type de demande">
      <button type="button" role="radio" [attr.aria-checked]="kind() === 'AUDITION'" (click)="kind.set('AUDITION')">Convoquer à une audition</button>
      <button type="button" role="radio" [attr.aria-checked]="kind() === 'PROPOSITION'" (click)="kind.set('PROPOSITION')">Proposer le rôle</button>
    </div>

    @if (kind() === 'AUDITION') {
      <div class="f">
        <label for="od-date">Date de l'audition</label>
        <app-date-field inputId="od-date" name="date" [(ngModel)]="date" [min]="today" [max]="shootEnd()" [openAt]="shootStart()"
                        maxMessage="Après la fin du tournage." minMessage="Date déjà passée." ariaLabel="Date de l'audition" />
      </div>
      <div class="row2">
        <div class="f">
          <label for="od-time">Heure</label>
          <input id="od-time" name="time" type="time" step="900" [(ngModel)]="time" />
        </div>
        <div class="f grow">
          <label for="od-place">Lieu</label>
          <input id="od-place" name="place" [(ngModel)]="place" maxlength="200" placeholder="Ex. Studio 2, 12 avenue Habib Bourguiba, Tunis" autocomplete="street-address" />
        </div>
      </div>
    }
    <div class="f">
      <label for="od-msg">Message <span class="opt">facultatif</span></label>
      <textarea id="od-msg" name="msg" [(ngModel)]="message" rows="3" maxlength="1000"
                [placeholder]="kind() === 'AUDITION' ? 'Ex. Scène 4 à préparer, texte envoyé par e-mail.' : 'Ex. Le réalisateur a retenu votre essai.'"></textarea>
    </div>
    @if (error()) { <p class="field-msg" role="alert">{{ error() }}</p> }
    <div class="actions">
      <button type="button" class="btn-ghost" (click)="close.emit()">Annuler</button>
      <button type="submit" class="btn-primary" [disabled]="busy()">{{ kind() === 'AUDITION' ? 'Envoyer la convocation' : 'Envoyer la proposition' }}</button>
    </div>
  </form>
  `,
  styles: [`
  :host { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 20px; }
  @media (max-width: 600px) { :host { padding: 12px; } }
  .backdrop { position: absolute; inset: 0; background: rgba(10,10,12,.55); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); animation: fade .2s both; }
  .panel { position: relative; width: min(520px, 100%); max-height: calc(100vh - 40px); max-height: calc(100dvh - 24px); overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; display: flex; flex-direction: column; gap: 14px;
    padding: 24px; border-radius: var(--radius-l); border: 1px solid var(--border); background: var(--glass-strong);
    -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); box-shadow: 0 30px 80px rgba(0,0,0,.4); animation: pop .32s cubic-bezier(.2,.8,.2,1) both; }
  h2 { font-size: 24px; }
  .lead { color: var(--text-muted); font-size: 14px; line-height: 1.55; }
  .seg { display: flex; padding: 3px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-surface); }
  .seg button { flex: 1; height: 36px; border: none; border-radius: 999px; background: none; color: var(--text-muted); font-size: 13.5px; font-weight: 600; cursor: pointer;
    &[aria-checked="true"] { background: var(--accent); color: var(--on-accent); } }
  .f { display: flex; flex-direction: column; gap: 6px; label { font-size: 13px; color: var(--text-muted); } .opt { color: var(--text-subtle); } }
  .row2 { display: flex; gap: 10px; } .grow { flex: 1; min-width: 0; }
  input[type=time], #od-place { height: 40px; padding: 0 10px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--glass);
    color: var(--text-primary); font: inherit; font-size: 14px; color-scheme: light dark; &:focus { outline: none; border-color: var(--accent); } }
  textarea { width: 100%; padding: 8px 10px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--glass); color: var(--text-primary);
    font: inherit; font-size: 14px; resize: vertical; &:focus { outline: none; border-color: var(--accent); } }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  .btn-primary, .btn-ghost { height: 40px; padding: 0 16px; border-radius: var(--radius-s); font-size: 14px; font-weight: 600; cursor: pointer; }
  .btn-primary { border: none; background: var(--accent); color: var(--on-accent); &:disabled { opacity: .6; cursor: progress; } }
  .btn-ghost { border: 1px solid var(--border); background: var(--glass); color: var(--text-primary); }
  /* Une popup trop haute pour l'écran défile : ses champs gardent leur taille au lieu d'être écrasés. */
  .panel > * { flex-shrink: 0; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: translateY(16px) scale(.97); } }
  @media (max-width: 560px) { .seg button { font-size: 12.5px; } .actions button { flex: 1; } .row2 { flex-direction: column; } }
  `]
})
export class OfferDialogComponent {
  private readonly api = inject(OfferService);
  readonly entryId = input.required<string>();
  readonly actorName = input('');
  readonly shootStart = input<string | null>(null);
  readonly shootEnd = input<string | null>(null);
  readonly close = output<void>();
  readonly sent = output<OfferRow>();

  readonly today = todayIso();
  readonly kind = signal<OfferKind>('AUDITION');
  readonly busy = signal(false);
  readonly error = signal('');
  date = '';
  time = '';
  place = '';
  message = '';

  /** Échap ferme la fenêtre, sauf quand il sert à refermer le calendrier. */
  onEscape(ev: Event): void {
    if ((ev.target as HTMLElement | null)?.closest('app-date-field')) return;
    this.close.emit();
  }

  send(): void {
    if (this.kind() === 'AUDITION' && !this.date) { this.error.set('Indiquez la date de l’audition.'); return; }
    if (this.kind() === 'AUDITION' && !this.time) { this.error.set('Indiquez l’heure de l’audition.'); return; }
    if (this.kind() === 'AUDITION' && !this.place.trim()) { this.error.set('Indiquez le lieu de l’audition.'); return; }
    this.busy.set(true);
    this.error.set('');
    const aud = this.kind() === 'AUDITION';
    this.api.send(this.entryId(), this.kind(), this.message.trim(), aud ? this.date : null, aud ? this.time : null, aud ? this.place.trim() : null).subscribe({
      next: o => { this.busy.set(false); this.sent.emit(o); },
      error: (e: HttpErrorResponse) => {
        this.busy.set(false);
        this.error.set(e.error?.code === 'CONTRAT_INACTIF' ? 'Votre contrat n’est pas actif : envoi impossible.' : (e.error?.message ?? 'Envoi impossible. Réessayez.'));
      }
    });
  }
}
