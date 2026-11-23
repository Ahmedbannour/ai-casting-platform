import { AfterViewInit, Component, DestroyRef, ElementRef, computed, inject, input, signal } from '@angular/core';

export type RailState = 'tour' | 'livree' | 'brouillon' | 'revision' | 'complete' | 'encours' | 'vide';
export interface RailItem { id: string; label: string; state: RailState | null; el: HTMLElement; }

const STATE_LABEL: Record<RailState, string> = { tour: 'À vous', livree: 'Livrée', brouillon: 'Brouillon', revision: 'En révision', complete: 'Complet', encours: 'En cours', vide: 'À remplir' };

/**
 * Sommaire « Sur cette fiche » : lit les sections réellement affichées pour le rôle connecté
 * (chaque rôle voit donc son propre déroulé), suit la section en cours pendant le défilement,
 * montre la part lue et l'état de chaque étape, comme les étapes d'un build.
 * Écran large : rail fixe à droite. Écran étroit : barre compacte qui se déplie.
 */
@Component({
  selector: 'app-page-rail',
  standalone: true,
  template: `
  @if (items().length > 1) {
    <nav class="rail" [class.open]="open()" [class.compact]="compact()" aria-label="Sur cette fiche">
      <button type="button" class="bar" (click)="open.set(!open())" [attr.aria-expanded]="open()">
        <span class="bar-n">{{ pad(active() + 1) }}<i>/{{ pad(items().length) }}</i></span>
        <span class="bar-l">{{ items()[active()]?.label }}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        <span class="bar-p" aria-hidden="true"><b [style.width.%]="pct()"></b></span>
      </button>
      <div class="panel">
        <div class="hd"><span>Sur cette fiche</span><span class="n">{{ pad(active() + 1) }} / {{ pad(items().length) }}</span></div>
        <ol>
          @for (it of items(); track it.id; let i = $index) {
            <li [class.on]="i === active()" [class.past]="i < active()" [attr.data-s]="it.state">
              <a [href]="'#' + it.id" (click)="go($event, it)" [attr.aria-current]="i === active() ? 'location' : null">
                <span class="dot" aria-hidden="true"></span>
                <span class="lb">{{ it.label }}</span>
                @if (it.state) { <span class="st">{{ stateLabel(it.state) }}</span> }
              </a>
            </li>
          }
        </ol>
        <div class="ft"><span class="pb" aria-hidden="true"><b [style.width.%]="pct()"></b></span><span>{{ pct() }} % lu</span></div>
      </div>
    </nav>
  }
  `,
  styles: [`
    :host { display: block; }
    .rail { position: sticky; top: 24px; font-size: 13.5px; }
    .bar { display: none; }
    .hd { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; font-size: 12px; font-weight: 700; color: var(--text-muted); }
    .hd .n { font-variant-numeric: tabular-nums; color: var(--accent-ink); }
    ol { list-style: none; margin: 0; padding: 0; position: relative; }
    /* Le fil : une ligne verticale qui relie les étapes */
    ol::before { content: ''; position: absolute; left: 6px; top: 10px; bottom: 10px; width: 2px; border-radius: 2px; background: color-mix(in srgb, var(--text-subtle) 25%, transparent); }
    li a { position: relative; display: flex; align-items: flex-start; gap: 10px; padding: 7px 4px 7px 0; min-height: 36px; box-sizing: border-box;
      color: var(--text-muted); text-decoration: none; line-height: 1.35; border-radius: 8px; transition: color .2s; }
    li a:hover { color: var(--text-primary); }
    li a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .dot { position: relative; z-index: 1; flex: none; width: 14px; height: 14px; margin-top: 2px; border-radius: 50%; box-sizing: border-box;
      border: 2px solid color-mix(in srgb, var(--text-subtle) 55%, transparent); background: var(--bg-primary); transition: transform .25s cubic-bezier(.2,1.4,.4,1), background .2s, border-color .2s; }
    li.past .dot { background: color-mix(in srgb, var(--accent) 45%, var(--bg-primary)); border-color: transparent; }
    li.on a { color: var(--text-primary); font-weight: 700; }
    li.on .dot { border-color: var(--accent); background: var(--accent); transform: scale(1.15); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent); }
    .lb { flex: 1; min-width: 0; }
    .st { flex: none; margin-top: 1px; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: color-mix(in srgb, var(--text-subtle) 14%, transparent); color: var(--text-secondary); }
    li[data-s="tour"] .st { background: var(--accent); color: var(--on-accent); }
    li[data-s="tour"] .dot { border-color: var(--accent); }
    li[data-s="livree"] .st { background: color-mix(in srgb, var(--success) 16%, transparent); color: var(--success); }
    li[data-s="complete"] .st { background: color-mix(in srgb, var(--success) 16%, transparent); color: var(--success); }
    li[data-s="complete"] .dot { background: var(--success); border-color: var(--success); }
    li[data-s="encours"] .st { background: var(--accent-dim); color: var(--accent-ink); }
    li[data-s="vide"] .st { background: none; color: var(--text-subtle); padding: 2px 0; }
    li[data-s="revision"] .st { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
    .ft { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; font-size: 12px; font-weight: 600; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .pb, .bar-p { display: block; height: 4px; border-radius: 4px; overflow: hidden; background: color-mix(in srgb, var(--text-subtle) 22%, transparent); }
    .pb b, .bar-p b { display: block; height: 100%; border-radius: 4px; background: var(--accent); transition: width .2s linear; }

    /* Barre compacte quand le sommaire occupe toute la largeur (écran étroit ou colonne unique) */
    .rail.compact { position: static; margin: 0 -2px; }
    .compact .bar { position: relative; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; padding: 0 14px; border: 1px solid var(--border);
    border-radius: 14px; background: color-mix(in srgb, var(--glass-strong) 30%, var(--bg-primary)); color: var(--text-primary); font: inherit; cursor: pointer;
    box-shadow: 0 8px 20px color-mix(in srgb, var(--graphite-950) 12%, transparent); overflow: hidden; }
    .compact .bar-n { flex: none; font-weight: 800; color: var(--accent-ink); font-variant-numeric: tabular-nums; } .bar-n i { font-style: normal; font-weight: 600; color: var(--text-muted); }
    .compact .bar-l { flex: 1; min-width: 0; text-align: left; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .compact .bar svg { flex: none; width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; transition: transform .2s; }
    .rail.compact.open .bar svg { transform: rotate(180deg); }
    .compact .bar-p { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; border-radius: 0; }
    .compact .panel { display: none; margin-top: 6px; padding: 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg-secondary);
    box-shadow: 0 16px 34px color-mix(in srgb, var(--graphite-950) 22%, transparent); max-height: 60vh; overflow-y: auto; }
    .rail.compact.open .panel { display: block; animation: pIn .2s ease-out; }
    .compact li a { min-height: 44px; align-items: center; }
    .compact .dot { margin-top: 0; }
    @keyframes pIn { from { opacity: 0; transform: translateY(-4px); } }
    @media (prefers-reduced-motion: reduce) { .dot, .open .panel, .pb b, .bar-p b { transition: none; animation: none; } }
  `]
})
export class PageRailComponent implements AfterViewInit {
  /** Élément dont on lit les sections (titres h2). */
  readonly root = input.required<HTMLElement>();
  readonly items = signal<RailItem[]>([]);
  readonly active = signal(0);
  readonly pct = signal(0);
  readonly open = signal(false);
  /** Barre compacte quand le sommaire a toute la largeur (plus de 300 px) au lieu d'une colonne. */
  readonly compact = signal(false);
  readonly stateLabel = (s: RailState) => STATE_LABEL[s];
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private scroller: HTMLElement | null = null;
  private frame = 0;

  ngAfterViewInit(): void {
    this.scroller = this.host.nativeElement.closest('.content') as HTMLElement | null;
    const target: HTMLElement | Window = this.scroller ?? window;
    const onScroll = () => { if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.track(); }); };
    target.addEventListener('scroll', onScroll, { passive: true });
    // La fiche change (mise à jour en direct, nouvelle version, action faite) : on relit les sections
    let t: ReturnType<typeof setTimeout> | null = null;
    const mo = new MutationObserver(() => { if (t) clearTimeout(t); t = setTimeout(() => this.scan(), 250); });
    mo.observe(this.root(), { childList: true, subtree: true, attributes: true, attributeFilter: ['data-rail-state', 'data-rail-label'] });
    const close = (e: Event) => { if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false); };
    document.addEventListener('pointerdown', close);
    this.destroyRef.onDestroy(() => { target.removeEventListener('scroll', onScroll); mo.disconnect(); document.removeEventListener('pointerdown', close); if (t) clearTimeout(t); });
    const ro = new ResizeObserver(([e]) => this.compact.set(e.contentRect.width > 300));
    ro.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => ro.disconnect());
    setTimeout(() => this.scan(), 0);
  }

  /** Relit les sections visibles, dans l'ordre où elles apparaissent à l'écran. */
  scan(): void {
    const root = this.root();
    // « À vous » seulement quand c'est vraiment le tour de la personne (carte d'état « À vous de jouer »)
    const myTurn = !!root.querySelector('.now-card.mine');
    const heads = [...root.querySelectorAll<HTMLElement>('h2')].filter(h => h.offsetParent !== null && !h.closest('app-page-rail'));
    const list: RailItem[] = heads.map((h, i) => {
      const el = (h.closest('[data-rail], .card, app-discussion, app-invite-card') as HTMLElement | null) ?? h;
      if (!el.id) el.id = 'fiche-' + i;
      const small = h.querySelector('small')?.textContent?.toLowerCase() ?? '';
      const label = [...h.childNodes].filter(n => n.nodeType === Node.TEXT_NODE || (n as HTMLElement).tagName !== 'SMALL').map(n => n.textContent).join('').trim();
      // Un bloc peut donner lui-même son état et son nom court (data-rail-state, data-rail-label)
      const given = el.dataset['railState'] as RailState | undefined;
      const state: RailItem['state'] = given ? given : myTurn && el.matches('.answer, .act, app-invite-card') ? 'tour'
        : small.includes('révision') ? 'revision' : small.includes('brouillon') ? 'brouillon' : small.includes('livrée') ? 'livree' : null;
      return { id: el.id, label: el.dataset['railLabel'] || label || 'Section', state, el };
    }).filter((it, i, all) => all.findIndex(x => x.el === it.el) === i)
      .sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top);
    const same = list.length === this.items().length && list.every((x, i) => x.id === this.items()[i].id && x.state === this.items()[i].state && x.label === this.items()[i].label);
    if (!same) this.items.set(list);
    this.track();
  }

  private track(): void {
    const s = this.scroller;
    const top = s ? s.getBoundingClientRect().top : 0;
    const scrollTop = s ? s.scrollTop : window.scrollY;
    const max = s ? s.scrollHeight - s.clientHeight : document.documentElement.scrollHeight - innerHeight;
    this.pct.set(max > 0 ? Math.min(100, Math.round(scrollTop / max * 100)) : 100);
    const list = this.items(); if (!list.length) return;
    let a = 0;
    list.forEach((it, i) => { if (it.el.getBoundingClientRect().top - top <= 140) a = i; });
    if (max > 0 && scrollTop >= max - 4) a = list.length - 1;   // tout en bas : la dernière section
    this.active.set(a);
  }

  go(e: Event, it: RailItem): void {
    e.preventDefault();
    this.open.set(false);
    it.el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    const f = it.el.matches('h2') ? it.el : it.el.querySelector<HTMLElement>('h2');
    if (f) { f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: true }); }
  }

  pad(n: number): string { return String(n).padStart(2, '0'); }
}
