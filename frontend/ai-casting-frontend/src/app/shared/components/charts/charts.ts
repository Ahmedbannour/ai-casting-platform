import { Component, computed, input, signal } from '@angular/core';

/* Graphiques SVG légers, animés à l'arrivée, avec survol. Textes en encre du thème, jamais en couleur de série. */

export interface ColumnSeries { name: string; color: string; values: number[]; }

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « 2026-11 » → « nov. » (ou « nov. 26 » si demandé). */
export function monthLabel(ym: string, withYear = false): string {
  const [y, m] = ym.split('-').map(Number);
  return MONTHS[(m || 1) - 1] + (withYear ? ' ' + String(y).slice(2) : '');
}

/** Graduation « ronde » : 4 intervalles jusqu'à un maximum lisible. */
function niceMax(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(f => f * pow).find(s => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { top, ticks };
}

const fmt = (n: number) => n.toLocaleString('fr-FR');

// ═══════════════════════ Colonnes empilées ═══════════════════════
@Component({
  selector: 'app-stacked-columns',
  standalone: true,
  template: `
  <div class="legend" aria-hidden="true">
    @for (s of series(); track s.name) { <span><i [style.background]="s.color"></i>{{ s.name }}</span> }
  </div>
  <div class="plot" (mouseleave)="hover.set(-1)">
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" [attr.aria-label]="ariaLabel()">
      @for (t of scale().ticks; track t) {
        <line class="grid" [attr.x1]="padL" [attr.x2]="W" [attr.y1]="y(t)" [attr.y2]="y(t)" />
      }
      @for (col of columns(); track col.i) {
        <g class="col" [style.animation-delay.ms]="col.i * 45" [class.dim]="hover() >= 0 && hover() !== col.i">
          @for (seg of col.segs; track seg.name) {
            <rect [attr.x]="col.x" [attr.y]="seg.y" [attr.width]="col.w" [attr.height]="seg.h" [attr.fill]="seg.color"
                  [attr.rx]="seg.top ? 3 : 0" />
          }
        </g>
        <rect class="hit" [attr.x]="col.x - col.gap / 2" y="0" [attr.width]="col.w + col.gap" [attr.height]="H" (mouseenter)="hover.set(col.i)" />
      }
    </svg>
    <div class="yaxis" aria-hidden="true">
      @for (t of scale().ticks; track t) { <span [style.top.%]="100 * y(t) / H">{{ fmt(t) }}</span> }
    </div>
    <div class="xaxis" aria-hidden="true">
      @for (l of labels(); track $index) { <span [style.left.%]="100 * (columns()[$index].x + columns()[$index].w / 2) / W">{{ $index % xEvery() === 0 ? short(l) : '' }}</span> }
    </div>
    @if (hover() >= 0) {
      @let c = columns()[hover()];
      <div class="tip" [style.left.%]="100 * (c.x + c.w / 2) / W" [class.left]="c.x > W * 0.6">
        <b>{{ long(labels()[hover()]) }}</b>
        @for (s of series(); track s.name) {
          <span><i [style.background]="s.color"></i>{{ s.name }}<em>{{ fmt(s.values[hover()] || 0) }}</em></span>
        }
        <span class="total">Total<em>{{ fmt(c.total) }}</em></span>
      </div>
    }
  </div>
  `,
  styleUrl: './charts.scss'
})
export class StackedColumnsComponent {
  readonly labels = input<string[]>([]);
  readonly series = input<ColumnSeries[]>([]);
  readonly ariaLabel = input('');
  readonly W = 600; readonly H = 220; readonly padL = 0;
  readonly hover = signal(-1);
  readonly fmt = fmt;
  short = (l: string) => monthLabel(l);
  long = (l: string) => { const [y] = l.split('-'); return monthLabel(l).replace('.', '') + ' ' + y; };

  readonly totals = computed(() => this.labels().map((_, i) => this.series().reduce((a, s) => a + (s.values[i] || 0), 0)));
  readonly scale = computed(() => niceMax(Math.max(0, ...this.totals())));
  readonly xEvery = computed(() => (this.labels().length > 8 ? 2 : 1));
  y(v: number): number { return this.H - (v / this.scale().top) * (this.H - 8); }

  readonly columns = computed(() => {
    const n = Math.max(1, this.labels().length);
    const slot = this.W / n, gap = Math.min(18, slot * 0.35), w = slot - gap;
    return this.labels().map((_, i) => {
      let acc = 0;
      const segs: { name: string; color: string; y: number; h: number; top: boolean }[] = [];
      const visible = this.series().filter(s => (s.values[i] || 0) > 0);
      visible.forEach((s, k) => {
        const v = s.values[i] || 0;
        const y0 = this.y(acc), y1 = this.y(acc + v);
        // 2 px de fond entre deux segments empilés
        // 2 px de fond entre un segment et celui qu'il surmonte
        const below = k > 0 ? 2 : 0;
        const h = Math.max(0, y0 - y1 - below);
        segs.push({ name: s.name, color: s.color, y: y1, h, top: k === visible.length - 1 });
        acc += v;
      });
      return { i, x: i * slot + gap / 2, w, gap, segs, total: this.totals()[i] };
    });
  });
}

// ═══════════════════════ Courbe avec aire (une série) ═══════════════════════
@Component({
  selector: 'app-area-spark',
  standalone: true,
  template: `
  <div class="spark-head">
    <span class="spark-title">{{ title() }}</span>
    <b class="spark-value">{{ fmt(total()) }}</b>
    <small>sur {{ values().length }} mois</small>
  </div>
  <div class="plot spark" (mousemove)="move($event)" (mouseleave)="hover.set(-1)">
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" role="img" [attr.aria-label]="title() + ', ' + fmt(total()) + ' sur la période'">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" [attr.stop-color]="color()" stop-opacity=".28" />
          <stop offset="1" [attr.stop-color]="color()" stop-opacity="0" />
        </linearGradient>
      </defs>
      <line class="grid" x1="0" [attr.x2]="W" [attr.y1]="H - 1" [attr.y2]="H - 1" />
      <path class="area" [attr.d]="areaPath()" [attr.fill]="'url(#' + gid + ')'" />
      <path class="line" [attr.d]="linePath()" [attr.stroke]="color()" pathLength="1" />
      @if (hover() >= 0) {
        <line class="cross" [attr.x1]="px(hover())" [attr.x2]="px(hover())" y1="0" [attr.y2]="H" />
        <circle [attr.cx]="px(hover())" [attr.cy]="py(values()[hover()])" r="5" [attr.fill]="color()" class="dot" />
      }
    </svg>
    @if (hover() >= 0) {
      <div class="tip small" [style.left.%]="100 * px(hover()) / W" [class.left]="hover() > values().length * 0.6">
        <b>{{ long(labels()[hover()]) }}</b><span>{{ title() }}<em>{{ fmt(values()[hover()]) }}</em></span>
      </div>
    }
  </div>
  `,
  styleUrl: './charts.scss'
})
export class AreaSparkComponent {
  private static seq = 0;
  readonly title = input('');
  readonly labels = input<string[]>([]);
  readonly values = input<number[]>([]);
  readonly color = input('var(--accent)');
  readonly gid = 'spark-' + (++AreaSparkComponent.seq);
  readonly W = 300; readonly H = 90;
  readonly hover = signal(-1);
  readonly fmt = fmt;
  long = (l: string) => { const [y] = (l || '').split('-'); return monthLabel(l || '2000-01').replace('.', '') + ' ' + y; };

  readonly total = computed(() => this.values().reduce((a, b) => a + b, 0));
  private readonly max = computed(() => Math.max(1, ...this.values()));
  px(i: number): number { const n = this.values().length; return n <= 1 ? this.W / 2 : (i / (n - 1)) * (this.W - 8) + 4; }
  py(v: number): number { return this.H - 6 - (v / this.max()) * (this.H - 16); }
  readonly linePath = computed(() => this.values().map((v, i) => `${i ? 'L' : 'M'}${this.px(i).toFixed(1)},${this.py(v).toFixed(1)}`).join(' '));
  readonly areaPath = computed(() => {
    const n = this.values().length;
    if (!n) return '';
    return `${this.linePath()} L${this.px(n - 1).toFixed(1)},${this.H} L${this.px(0).toFixed(1)},${this.H} Z`;
  });

  move(e: MouseEvent): void {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const n = this.values().length;
    if (!n) return;
    const x = ((e.clientX - r.left) / r.width) * this.W;
    this.hover.set(Math.max(0, Math.min(n - 1, Math.round(((x - 4) / (this.W - 8)) * (n - 1)))));
  }
}

// ═══════════════════════ Barres horizontales ═══════════════════════
export interface HBar { label: string; value: number; note?: string; }

@Component({
  selector: 'app-hbars',
  standalone: true,
  template: `
  <ul class="hbars" [attr.aria-label]="ariaLabel()">
    @for (b of rows(); track b.label; let i = $index) {
      <li [title]="b.label + ' : ' + fmt(b.value) + (b.note ? ' — ' + b.note : '')">
        <span class="hl">{{ b.label }}</span>
        <span class="track"><span class="fill" [style.width.%]="b.pct" [style.background]="color()" [style.animation-delay.ms]="i * 60"></span></span>
        <span class="hv">{{ fmt(b.value) }}@if (showShare()) { <em>{{ b.share }} %</em> }</span>
      </li>
    } @empty { <li class="none">Pas encore de données.</li> }
  </ul>
  `,
  styleUrl: './charts.scss'
})
export class HBarsComponent {
  readonly bars = input<HBar[]>([]);
  readonly color = input('var(--accent)');
  readonly ariaLabel = input('');
  readonly showShare = input(true);
  readonly fmt = fmt;
  readonly rows = computed(() => {
    const max = Math.max(1, ...this.bars().map(b => b.value));
    const sum = Math.max(1, this.bars().reduce((a, b) => a + b.value, 0));
    return this.bars().map(b => ({ ...b, pct: (b.value / max) * 100, share: Math.round((b.value / sum) * 100) }));
  });
}
