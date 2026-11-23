import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { LiveService } from '../../core/services/live.service';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MyOffer, OFFER_KIND, OFFER_STATUS, OfferService } from '../../core/services/offer.service';
import { frDate } from '../../shared/forms/dates';

/** Espace de l'acteur : propositions de rôle et convocations reçues des agences (T-095). */
@Component({
  selector: 'app-my-offers',
  standalone: true,
  imports: [FormsModule],
  template: `
  <div class="page">
    <header class="head">
      <h1>Propositions</h1>
      <p>Les agences sous contrat vous proposent un rôle ou vous convoquent à une audition. Répondez ici : l'agence voit votre réponse tout de suite.</p>
    </header>

    @if (loading()) {
      <div class="skel"></div>
    } @else if (error()) {
      <p class="field-msg" role="alert">{{ error() }}</p>
    } @else {
      @if (pending().length) {
        <h2>À traiter <span>{{ pending().length }}</span></h2>
        <div class="list">
          @for (o of pending(); track o.id) {
            <article class="offer pending">
              <p class="kind">{{ kind[o.kind] }} · {{ o.agencyName }}</p>
              <h3>{{ o.roleName }}</h3>
              <p class="proj">{{ o.projectTitle }}{{ o.city ? ' · ' + o.city : '' }}</p>
              <dl>
                @if (o.auditionDate) { <div><dt>Audition</dt><dd>{{ frDate(o.auditionDate) }}@if (o.auditionTime) { à {{ o.auditionTime.slice(0, 5).replace(':', 'h') }} }</dd></div> }
                @if (o.auditionPlace) { <div><dt>Lieu</dt><dd>{{ o.auditionPlace }}</dd></div> }
                @if (o.shootStart) { <div><dt>Tournage</dt><dd>{{ frDate(o.shootStart) }}@if (o.shootEnd) { au {{ frDate(o.shootEnd) }} }</dd></div> }
              </dl>
              @if (o.roleDescription) { <p class="desc">{{ o.roleDescription }}</p> }
              @if (o.message) { <blockquote>{{ o.message }}</blockquote> }
              <label class="note-l" [for]="'n-' + o.id">Un mot pour l'agence (facultatif)</label>
              <textarea [id]="'n-' + o.id" [(ngModel)]="notes[o.id]" rows="2" maxlength="500" placeholder="Ex. disponible le matin uniquement"></textarea>
              @if (errorFor() === o.id) { <p class="field-msg" role="alert">{{ answerError() }}</p> }
              <div class="actions">
                <button type="button" class="btn-primary" [disabled]="busy() === o.id" (click)="answer(o, 'ACCEPTEE')"
                        [attr.aria-label]="o.kind === 'AUDITION' ? 'Accepter la convocation' : null">
                  Accepter
                </button>
                <button type="button" class="btn-ghost" [disabled]="busy() === o.id" (click)="answer(o, 'DECLINEE')">Décliner</button>
              </div>
            </article>
          }
        </div>
      }

      <h2>Historique</h2>
      @if (done().length) {
        <ul class="hist">
          @for (o of done(); track o.id) {
            <li [attr.data-s]="o.status">
              <b>{{ o.roleName }}</b> <span class="muted">{{ o.projectTitle }} · {{ o.agencyName }}</span>
              <span class="st">{{ status[o.status] }}</span>
            </li>
          }
        </ul>
      } @else if (!pending().length) {
        <div class="empty">
          <h3>Aucune proposition pour l'instant</h3>
          <p>Une fiche complète, avec photo principale et disponibilités à jour, ressort mieux dans les recherches des agences.</p>
        </div>
      } @else {
        <p class="muted">Vos réponses passées apparaîtront ici.</p>
      }
    }
  </div>
  `,
  styles: [`
  :host { display: block; }
  .page { max-width: 820px; padding: 28px 32px 40px; display: flex; flex-direction: column; gap: 16px; }
  h1 { font-size: 38px; line-height: 1.05; }
  .head p { margin-top: 8px; color: var(--text-muted); line-height: 1.55; max-width: 64ch; }
  h2 { font-size: 18px; font-stretch: 100%; margin-top: 8px; display: flex; gap: 8px; align-items: center;
    span { font-size: 12.5px; padding: 1px 8px; border-radius: 999px; background: var(--accent); color: var(--on-accent); } }
  .list { display: flex; flex-direction: column; gap: 12px; }
  .offer { padding: 18px; border-radius: var(--radius-l); border: 1px solid var(--border); border-left: 4px solid var(--accent);
    background: var(--glass); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); display: flex; flex-direction: column; gap: 8px; }
  .kind { font-size: 13px; color: var(--text-muted); }
  h3 { font-size: 26px; line-height: 1.1; }
  .proj { color: var(--text-muted); }
  dl { display: flex; flex-wrap: wrap; gap: 6px 22px; margin: 2px 0; div { display: flex; gap: 6px; } dt { color: var(--text-muted); } dd { margin: 0; font-weight: 600; } }
  .desc { line-height: 1.55; }
  blockquote { margin: 0; padding: 8px 12px; border-left: 3px solid var(--border); color: var(--text-primary); font-style: italic; background: var(--bg-hover); border-radius: 4px; }
  .note-l { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
  textarea { width: 100%; padding: 8px 10px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--bg-surface);
    color: var(--text-primary); font: inherit; font-size: 14px; resize: vertical; &:focus { outline: none; border-color: var(--accent); } }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  .btn-primary, .btn-ghost { height: 40px; padding: 0 16px; border-radius: var(--radius-s); font-size: 14px; font-weight: 600; cursor: pointer; }
  .btn-primary { border: none; background: var(--accent); color: var(--on-accent); &:hover { background: var(--accent-hover); } }
  .btn-ghost { border: 1px solid var(--border); background: var(--glass); color: var(--text-primary); &:hover { background: var(--bg-hover); } }
  button:disabled { opacity: .6; cursor: progress; }
  .hist { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px;
    li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; padding: 10px 14px; border-radius: var(--radius-m);
      border: 1px solid var(--border); background: var(--bg-surface); } }
  .st { margin-left: auto; font-size: 12.5px; font-weight: 600; }
  li[data-s="ACCEPTEE"] .st { color: var(--series-3); }
  li[data-s="DECLINEE"] .st { color: var(--text-muted); }
  .muted { color: var(--text-muted); font-size: 13.5px; }
  .empty { padding: 32px 20px; text-align: center; border-radius: var(--radius-m); border: 1px dashed var(--border);
    h3 { font-size: 20px; } p { margin-top: 8px; color: var(--text-muted); } }
  .skel { height: 180px; border-radius: var(--radius-l); background: var(--bg-hover); }
  @container page (max-width: 760px) { .page { padding: 20px 16px 32px; } h1 { font-size: 30px; } .actions button { flex: 1; } }
  `]
})
export class MyOffersComponent implements OnInit {
  private readonly api = inject(OfferService);
  readonly frDate = frDate;
  readonly kind = OFFER_KIND;
  readonly status = OFFER_STATUS;
  readonly offers = signal<MyOffer[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal<string | null>(null);
  readonly errorFor = signal<string | null>(null);
  readonly answerError = signal('');
  readonly pending = computed(() => this.offers().filter(o => o.status === 'ENVOYEE'));
  readonly done = computed(() => this.offers().filter(o => o.status !== 'ENVOYEE'));
  notes: Record<string, string> = {};

  private readonly live = inject(LiveService);
  private readonly destroyRef = inject(DestroyRef);
  ngOnInit(): void { this.load(); this.live.watch(this.destroyRef, () => this.load()); }

  private load(): void {
    this.api.mine().subscribe({
      next: o => { this.offers.set(o); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger vos propositions. Rechargez la page.'); }
    });
  }

  answer(o: MyOffer, a: 'ACCEPTEE' | 'DECLINEE'): void {
    this.busy.set(o.id);
    this.errorFor.set(null);
    this.api.answer(o.id, a, this.notes[o.id] ?? '').subscribe({
      next: () => { this.busy.set(null); this.load(); },
      error: (e: HttpErrorResponse) => {
        this.busy.set(null);
        this.errorFor.set(o.id);
        this.answerError.set(e.error?.message ?? 'Réponse non enregistrée. Réessayez.');
        if (e.status === 409) this.load();
      }
    });
  }
}
