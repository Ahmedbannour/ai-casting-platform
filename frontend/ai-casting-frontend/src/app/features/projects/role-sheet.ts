import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CastingRole, CastingService, EntryStatus, ShortlistEntry, criteria } from '../../core/services/casting.service';

/**
 * Planche contact d'un rôle, prête à imprimer ou à enregistrer en PDF (US-16).
 * Générée dans le navigateur (impression → « Enregistrer au format PDF ») : aucun service externe, coût zéro.
 */
@Component({
  selector: 'app-role-sheet',
  standalone: true,
  imports: [RouterLink],
  template: `
  <div class="toolbar no-print">
    @if (role(); as r) { <a [routerLink]="['/roles', r.id]" class="back">← Retour au rôle</a> }
    <label class="opt"><input type="checkbox" [checked]="hideRefused()" (change)="hideRefused.set(!hideRefused())" /> Masquer les refusés</label>
    <button type="button" class="print" (click)="print()">Imprimer ou enregistrer en PDF</button>
  </div>

  @if (role(); as r) {
    <article class="sheet">
      <header>
        <div>
          <p class="project">{{ r.projectTitle }}</p>
          <h1>{{ r.name }}</h1>
          <p class="crit">{{ criteria(r) }}</p>
        </div>
        <div class="meta">
          <span class="mark" aria-hidden="true"></span>
          <span>Planche contact · {{ today }}</span>
          <span>{{ shown().length }} candidat{{ shown().length > 1 ? 's' : '' }}</span>
        </div>
      </header>

      <div class="grid">
        @for (e of shown(); track e.id; let i = $index) {
          <figure class="frame" [class.chosen]="e.status === 'CHOISI'">
            <div class="photo">
              @if (e.photoUrl && !broken().has(e.photoUrl)) { <img [src]="e.photoUrl" alt="" (error)="markBroken(e.photoUrl)" /> }
              @else { <span class="ini">{{ (e.firstName[0] || '') + (e.lastName[0] || '') }}</span> }
              <span class="n">{{ i + 1 }}</span>
              @if (e.status === 'CHOISI') { <span class="loop" aria-hidden="true"></span> }
            </div>
            <figcaption>
              <b>{{ e.firstName }} {{ e.lastName }}</b>
              <span>{{ e.age ? e.age + ' ans' : '' }}{{ e.age && e.city ? ' · ' : '' }}{{ e.city || '' }}</span>
              <span class="status">{{ label(e.status) }}{{ e.auditionDate ? ' · audition le ' + date(e.auditionDate) : '' }}</span>
              @if (e.availability === 'A_VERIFIER') { <span class="warn">{{ e.availabilityNote }}</span> }
              @if (e.note) { <span class="note">« {{ e.note }} »</span> }
            </figcaption>
          </figure>
        } @empty {
          <p class="empty">La shortlist de ce rôle est vide.</p>
        }
      </div>
      <footer>AI Casting · document de travail confidentiel · données personnelles des acteurs : ne pas diffuser hors production.</footer>
    </article>
  }
  `,
  styles: [`
  :host { display: block; min-height: 100vh; background: #e9e7e1; padding: 24px; color: #1b1c20; }
  .toolbar { max-width: 1000px; margin: 0 auto 16px; display: flex; align-items: center; gap: 16px; }
  .back { color: #3d3f46; text-decoration: none; font-size: 14px; }
  .opt { margin-left: auto; font-size: 14px; display: flex; gap: 6px; align-items: center; }
  .print { height: 40px; padding: 0 16px; border: none; border-radius: 6px; background: #1f2024; color: #f2c230; font-weight: 700; cursor: pointer; }
  .sheet { max-width: 1000px; margin: 0 auto; background: #fff; padding: 36px 40px 28px; box-shadow: 0 10px 40px rgba(0,0,0,.12); font-family: var(--font); }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; padding-bottom: 16px; border-bottom: 2px solid #1b1c20; margin-bottom: 20px; }
  .project { font-size: 13px; color: #575c66; }
  h1 { font-size: 34px; font-stretch: 78%; line-height: 1.05; margin: 2px 0 6px; }
  .crit { font-size: 14px; color: #3d3f46; }
  .meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 12.5px; color: #575c66; }
  .mark { width: 22px; height: 22px; border-radius: 50%; border: 3px solid #c99400; transform: rotate(-8deg) scaleX(1.12); margin-bottom: 4px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px 14px; }
  .frame { margin: 0; break-inside: avoid; }
  .photo { position: relative; aspect-ratio: 4 / 5; background: #d8d6d0; overflow: hidden; }
  .photo img { width: 100%; height: 100%; object-fit: cover; display: block; filter: grayscale(.15); }
  .ini { position: absolute; inset: 0; display: grid; place-items: center; font-size: 34px; font-weight: 700; color: #8a8780; }
  .n { position: absolute; left: 0; bottom: 0; padding: 2px 7px; background: #1b1c20; color: #fff; font-size: 11px; font-weight: 700; }
  .loop { position: absolute; inset: 6% 4%; border: 4px solid #c99400; border-radius: 50%; transform: rotate(-6deg); }
  figcaption { display: flex; flex-direction: column; gap: 1px; padding-top: 6px; font-size: 12px; color: #3d3f46; }
  figcaption b { font-size: 14px; font-stretch: 78%; color: #1b1c20; }
  .status { font-weight: 600; color: #1b1c20; }
  .chosen .status { color: #8a6500; }
  .warn { color: #b3402f; }
  .note { font-style: italic; color: #575c66; }
  .empty { grid-column: 1 / -1; color: #575c66; }
  footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #d0d4db; font-size: 11px; color: #8f95a0; }
  @container page (max-width: 760px) { .grid { grid-template-columns: repeat(2, 1fr); } .sheet { padding: 20px; } }
  @media print {
    :host { background: #fff; padding: 0; }
    .no-print { display: none !important; }
    .sheet { box-shadow: none; max-width: none; padding: 0; }
    @page { size: A4; margin: 14mm; }
  }
  `]
})
export class RoleSheetComponent implements OnInit {
  private readonly casting = inject(CastingService);
  private readonly route = inject(ActivatedRoute);

  readonly role = signal<CastingRole | null>(null);
  readonly entries = signal<ShortlistEntry[]>([]);
  readonly hideRefused = signal(true);
  readonly broken = signal<Set<string>>(new Set());
  readonly today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  criteria = criteria;

  private readonly order: EntryStatus[] = ['CHOISI', 'RAPPEL', 'AUDITION', 'PRESELECTIONNE', 'REFUSE'];
  readonly shown = computed(() => this.entries()
    .filter(e => !this.hideRefused() || e.status !== 'REFUSE')
    .sort((a, b) => this.order.indexOf(a.status) - this.order.indexOf(b.status)));

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.casting.role(id).subscribe(r => this.role.set(r));
    this.casting.shortlist(id).subscribe(e => this.entries.set(e));
  }

  print(): void { window.print(); }
  markBroken(url: string): void { this.broken.update(s => new Set(s).add(url)); }
  label(s: EntryStatus): string {
    return { PRESELECTIONNE: 'Présélectionné', AUDITION: 'Audition', RAPPEL: 'Rappel', CHOISI: 'Choisi', REFUSE: 'Refusé' }[s];
  }
  date(d: string): string { return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
}
