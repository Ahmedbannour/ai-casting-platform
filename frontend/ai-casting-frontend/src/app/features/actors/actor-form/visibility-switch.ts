import { Component, OnInit, inject, signal } from '@angular/core';
import { MeService } from '../../../core/services/me.service';
import { frDate } from '../../../shared/forms/dates';

type V = 'VISIBLE' | 'PAUSE';

/** L'acteur décide lui-même s'il est visible des agences ou en pause (T-093). Enregistré dès le choix. */
@Component({
  selector: 'app-visibility-switch',
  standalone: true,
  template: `
  <section class="vis" [attr.data-v]="value()" aria-labelledby="vis-t">
    <div class="txt">
      <h2 id="vis-t">{{ value() === 'VISIBLE' ? 'Votre profil est visible' : 'Votre profil est en pause' }}</h2>
      <p>
        @if (value() === 'VISIBLE') {
          Les agences sous contrat avec la plateforme peuvent vous trouver et le présenter aux réalisateurs de leurs projets.
        } @else {
          Aucune agence ne vous trouve dans ses recherches et vous n'apparaissez plus dans les liens envoyés aux réalisateurs. Votre fiche est conservée.
        }
        @if (changedAt()) { <span class="when">Modifié le {{ frDate(changedAt()!.slice(0, 10)) }}.</span> }
      </p>
      @if (error()) { <p class="field-msg" role="alert">{{ error() }}</p> }
      <details class="views">
        <summary>Qui a consulté mes coordonnées ({{ views().length }})</summary>
        @if (views().length) {
          <ul>@for (v of views(); track v.viewedAt) { <li><b>{{ v.who }}</b> {{ when(v.viewedAt) }}</li> }</ul>
        } @else {
          <p>Aucune agence n'a encore demandé votre téléphone ou votre e-mail. Chaque demande apparaîtra ici.</p>
        }
      </details>
    </div>
    <div class="seg" role="radiogroup" aria-label="Visibilité de mon profil">
      @for (o of options; track o.v) {
        <button type="button" role="radio" [attr.aria-checked]="value() === o.v" [attr.data-o]="o.v"
                [disabled]="busy() || !loaded()" (click)="set(o.v)">{{ o.label }}</button>
      }
    </div>
  </section>
  `,
  styles: [`
  :host { display: block; margin-top: 16px; }
  .vis { display: flex; align-items: center; justify-content: space-between; gap: 16px 24px; flex-wrap: wrap; padding: 16px 18px;
    border-radius: var(--radius-l); border: 1px solid var(--border); border-left: 4px solid var(--series-3); background: var(--glass);
    -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); transition: border-color .25s; }
  .vis[data-v="PAUSE"] { border-left-color: var(--text-subtle); }
  .txt { flex: 1; min-width: 240px; }
  h2 { font-size: 18px; font-stretch: 100%; }
  p { margin-top: 4px; font-size: 13.5px; line-height: 1.55; color: var(--text-muted); max-width: 70ch; }
  .views { margin-top: 8px; font-size: 13px; color: var(--text-muted);
    summary { cursor: pointer; color: var(--text-primary); font-weight: 600; width: fit-content; }
    ul { margin: 6px 0 0; padding-left: 18px; line-height: 1.6; } b { color: var(--text-primary); font-weight: 600; } }
  .when { margin-left: 4px; color: var(--text-subtle); }
  .seg { display: inline-flex; padding: 3px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-surface); flex: none; }
  .seg button { height: 34px; padding: 0 16px; border: none; border-radius: 999px; background: none; color: var(--text-muted);
    font-size: 13.5px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .2s, color .2s;
    &:hover:not([aria-checked="true"]) { color: var(--text-primary); } &:disabled { cursor: progress; } }
  .seg button[aria-checked="true"][data-o="VISIBLE"] { background: var(--series-3); color: #fff; }
  .seg button[aria-checked="true"][data-o="PAUSE"] { background: var(--text-primary); color: var(--bg-surface); }
  @container page (max-width: 560px) { .seg { width: 100%; } .seg button { flex: 1; } }
  @media (prefers-reduced-motion: reduce) { .vis, .seg button { transition: none; } }
  `]
})
export class VisibilitySwitchComponent implements OnInit {
  private readonly me = inject(MeService);
  readonly frDate = frDate;
  readonly options: { v: V; label: string }[] = [{ v: 'VISIBLE', label: 'Visible des agences' }, { v: 'PAUSE', label: 'En pause' }];
  readonly value = signal<V>('VISIBLE');
  readonly changedAt = signal<string | null>(null);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly views = signal<{ who: string; viewedAt: number }[]>([]);
  private readonly fmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  when(ms: number): string { const [d, t] = this.fmt.format(new Date(ms)).split(' '); return `le ${d} à ${t}`; }

  ngOnInit(): void {
    this.me.contactViews().subscribe({ next: v => this.views.set(v), error: () => {} });
    this.me.visibility().subscribe({
      next: r => { this.value.set(r.visibility); this.changedAt.set(r.changedAt); this.loaded.set(true); },
      error: () => this.error.set('Impossible de lire votre réglage de visibilité. Rechargez la page.')
    });
  }

  set(v: V): void {
    if (v === this.value()) return;
    const previous = this.value();
    this.value.set(v);
    this.busy.set(true);
    this.error.set('');
    this.me.setVisibility(v).subscribe({
      next: r => { this.busy.set(false); this.value.set(r.visibility); this.changedAt.set(r.changedAt); },
      error: () => { this.busy.set(false); this.value.set(previous); this.error.set('Réglage non enregistré. Réessayez.'); }
    });
  }
}
