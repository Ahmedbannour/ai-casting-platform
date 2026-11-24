import { Component, DestroyRef, ElementRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DAYS_FR, MONTHS_FR, addDays, fromIso, toIso, todayIso } from '../../forms/dates';

export interface CalMark { iso: string; label: string; tone?: 'accent' | 'success' | 'danger'; }
interface Day { iso: string; d: number; we: boolean; today: boolean; off: boolean; marks: CalMark[]; label: string; }
interface Month { key: string; title: string; lead: number; days: Day[]; }

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

/**
 * P-086 · Calendrier affiché dans la page (pas de fenêtre qui s'ouvre) : un jour, ou une période (premier puis dernier jour).
 * Deux mois côte à côte quand il y a la place, repères colorés (diffusion, tournage), week-ends marqués, clavier complet.
 * Valeur : « AAAA-MM-JJ » (jour) ou « AAAA-MM-JJ/AAAA-MM-JJ » (période).
 */
@Component({
  selector: 'app-calendar',
  standalone: true,
  template: `
  <div class="cal" [class.two]="count() === 2" (mouseleave)="hover.set(null)">
    <div class="head">
      <button type="button" class="nav" (click)="shift(-1)" [disabled]="!canPrev()" aria-label="Mois précédent"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
      <div class="titles" aria-live="polite">@for (m of months(); track m.key) { <b>{{ m.title }}</b> }</div>
      <button type="button" class="nav" (click)="shift(1)" aria-label="Mois suivant"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
    <div class="months">
      @for (m of months(); track m.key) {
        <div class="month" role="grid" [attr.aria-label]="m.title">
          <div class="dow" role="row">@for (d of dow; track $index) { <span role="columnheader" [class.we]="$index > 4">{{ d }}</span> }</div>
          <div class="days">
            @for (p of pads(m.lead); track $index) { <span class="pad" aria-hidden="true"></span> }
            @for (c of m.days; track c.iso) {
              <button type="button" class="d" role="gridcell" [attr.data-iso]="c.iso" [attr.tabindex]="c.iso === focus() ? 0 : -1"
                      [class.we]="c.we" [class.today]="c.today" [class.off]="c.off"
                      [class.s]="isStart(c.iso)" [class.solo]="isStart(c.iso) && !span()" [class.e]="isEnd(c.iso)" [class.in]="isIn(c.iso)" [class.pv]="isPreview(c.iso)"
                      [attr.aria-selected]="isStart(c.iso) || isEnd(c.iso) || isIn(c.iso)" [attr.aria-disabled]="c.off" [attr.aria-label]="c.label"
                      (click)="pick(c)" (mouseenter)="hover.set(c.iso)" (keydown)="key($event, c.iso)" (focus)="focus.set(c.iso)">
                <span class="n">{{ c.d }}</span>
                @if (c.marks.length) { <span class="mk" aria-hidden="true">@for (k of c.marks; track k.label) { <i [attr.data-tone]="k.tone ?? 'accent'"></i> }</span> }
              </button>
            }
          </div>
        </div>
      }
    </div>
    <div class="foot">
      @if (legend().length) {
        <ul class="legend">@for (l of legend(); track l.label) { <li><i [attr.data-tone]="l.tone ?? 'accent'" aria-hidden="true"></i>{{ l.label }}</li> }</ul>
      }
      <button type="button" class="today-btn" (click)="goToday()">Aujourd’hui</button>
    </div>
    <p class="status" aria-live="polite">{{ status() }}</p>
  </div>
  `,
  styleUrl: './calendar.scss'
})
export class CalendarComponent {
  readonly mode = input<'single' | 'range'>('single');
  readonly value = input<string | null | undefined>('');
  readonly min = input<string | null>(null);
  readonly marks = input<CalMark[]>([]);
  readonly valueChange = output<string>();

  readonly dow = DOW;
  readonly view = signal(this.firstOfMonth(todayIso()));
  readonly focus = signal(todayIso());
  readonly hover = signal<string | null>(null);
  /** Période : le premier jour est choisi, on attend le dernier. */
  readonly pending = signal<string | null>(null);
  readonly count = signal(1);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly start = computed(() => (this.value() ?? '').split('/')[0] || null);
  readonly end = computed(() => { const v = (this.value() ?? '').split('/'); return v[1] || v[0] || null; });

  constructor() {
    // Ouvre sur le mois de la valeur (ou du premier repère), une seule fois par valeur venue de l'extérieur
    effect(() => {
      const v = this.start();
      untracked(() => { if (v && fromIso(v) && !this.visible(v)) { this.view.set(this.firstOfMonth(v)); this.focus.set(v); } });
    });
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(e => this.count.set(e[0].contentRect.width >= 560 ? 2 : 1));
      ro.observe(this.host.nativeElement);
      inject(DestroyRef).onDestroy(() => ro.disconnect());
    }
  }

  readonly months = computed<Month[]>(() => {
    const out: Month[] = [], today = todayIso(), min = this.min();
    const byDay = new Map<string, CalMark[]>();
    for (const m of this.marks()) byDay.set(m.iso, [...(byDay.get(m.iso) ?? []), m]);
    for (let k = 0; k < this.count(); k++) {
      const first = fromIso(this.view())!; first.setMonth(first.getMonth() + k);
      const y = first.getFullYear(), mo = first.getMonth(), n = new Date(y, mo + 1, 0).getDate();
      const days: Day[] = [];
      for (let d = 1; d <= n; d++) {
        const iso = toIso(new Date(y, mo, d, 12)), wd = (new Date(y, mo, d, 12).getDay() + 6) % 7, mk = byDay.get(iso) ?? [];
        days.push({ iso, d, we: wd > 4, today: iso === today, off: !!min && iso < min, marks: mk,
          label: `${DAYS_FR[wd]} ${d} ${MONTHS_FR[mo]} ${y}${iso === today ? ", aujourd'hui" : ''}${mk.length ? ', ' + mk.map(x => x.label).join(', ') : ''}${!!min && iso < min ? ', passé' : ''}` });
      }
      out.push({ key: `${y}-${mo}`, title: `${MONTHS_FR[mo][0].toUpperCase()}${MONTHS_FR[mo].slice(1)} ${y}`, lead: (first.getDay() + 6) % 7, days });
    }
    return out;
  });
  readonly legend = computed(() => { const seen = new Map<string, CalMark>(); this.marks().forEach(m => seen.set(m.label, m)); return [...seen.values()]; });
  readonly canPrev = computed(() => !this.min() || this.view() > this.firstOfMonth(this.min()!));

  readonly status = computed(() => {
    const p = this.pending();
    if (this.mode() === 'range' && p) return `Premier jour : ${this.short(p)}. Cliquez le dernier jour (ou gardez une seule journée).`;
    const s = this.start(), e = this.end();
    if (!s) return this.mode() === 'range' ? 'Cliquez le premier jour, puis le dernier.' : 'Cliquez un jour.';
    if (this.mode() === 'single' || s === e) return `${this.short(s)} choisi.`;
    return `Du ${this.short(s)} au ${this.short(e!)}.`;
  });

  pads(n: number): number[] { return Array.from({ length: n }, (_, i) => i); }
  // Sélection affichée : la période en cours de choix (premier jour → survol) prime sur la valeur
  private sel(): [string | null, string | null] {
    const p = this.pending();
    if (p) { const h = this.hover() ?? p; return h < p ? [h, p] : [p, h]; }
    return [this.start(), this.end()];
  }
  /** Une vraie période (au moins deux jours) est affichée. */
  span(): boolean { const [s, e] = this.sel(); return this.mode() === 'range' && !!s && !!e && s !== e; }
  isStart(iso: string): boolean { return this.sel()[0] === iso; }
  isEnd(iso: string): boolean { const [s, e] = this.sel(); return this.mode() === 'range' && e === iso && e !== s; }
  isIn(iso: string): boolean { const [s, e] = this.sel(); return this.mode() === 'range' && !!s && !!e && iso > s && iso < e; }
  isPreview(iso: string): boolean { return !!this.pending() && (this.isIn(iso) || this.isEnd(iso)); }

  pick(c: Day): void {
    if (c.off) return;
    this.focus.set(c.iso);
    if (this.mode() === 'single') { this.valueChange.emit(c.iso); return; }
    const p = this.pending();
    if (!p) { this.pending.set(c.iso); this.valueChange.emit(`${c.iso}/${c.iso}`); return; }
    this.pending.set(null);
    this.valueChange.emit(c.iso < p ? `${c.iso}/${p}` : `${p}/${c.iso}`);
  }

  key(e: KeyboardEvent, iso: string): void {
    const d = fromIso(iso)!; let next: string | null = null;
    switch (e.key) {
      case 'ArrowLeft': next = addDays(iso, -1); break;
      case 'ArrowRight': next = addDays(iso, 1); break;
      case 'ArrowUp': next = addDays(iso, -7); break;
      case 'ArrowDown': next = addDays(iso, 7); break;
      case 'Home': next = addDays(iso, -((d.getDay() + 6) % 7)); break;
      case 'End': next = addDays(iso, 6 - (d.getDay() + 6) % 7); break;
      case 'PageUp': next = this.addMonth(iso, -1); break;
      case 'PageDown': next = this.addMonth(iso, 1); break;
      case 'Escape': if (this.pending()) { this.pending.set(null); e.stopPropagation(); e.preventDefault(); } return;
      default: return;
    }
    e.preventDefault(); e.stopPropagation();
    if (this.min() && next < this.min()!) next = this.min()!;
    this.focus.set(next); this.hover.set(this.pending() ? next : null);
    if (!this.visible(next)) this.view.set(next < this.view() ? this.firstOfMonth(next) : this.firstOfMonth(this.addMonth(next, 1 - this.count())));
    setTimeout(() => (this.host.nativeElement.querySelector(`[data-iso="${next}"]`) as HTMLElement | null)?.focus());
  }

  shift(n: number): void { this.view.set(this.addMonth(this.view(), n)); }
  goToday(): void { const t = todayIso(); this.view.set(this.firstOfMonth(t)); this.focus.set(t); }

  private visible(iso: string): boolean { const ms = this.months(); return ms.some(m => m.days.some(d => d.iso === iso)); }
  private firstOfMonth(iso: string): string { return iso.slice(0, 8) + '01'; }
  private addMonth(iso: string, n: number): string {
    const d = fromIso(iso)!, day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return toIso(d);
  }
  private short(iso: string): string { const d = fromIso(iso)!; return `${SHORT[(d.getDay() + 6) % 7]} ${d.getDate() === 1 ? '1er' : d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`; }
}
