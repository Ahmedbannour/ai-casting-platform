import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output,
  computed, effect, inject, signal, untracked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { InertiaPlugin } from 'gsap/InertiaPlugin';
import { ActorSearchResult } from '../../../core/services/ai-search.service';

gsap.registerPlugin(Draggable, InertiaPlugin);

export type SwipeDecision = 'RETENU' | 'ECARTE' | 'ANNULE';

export interface SwipeEvent {
  actor: ActorSearchResult;
  decision: SwipeDecision;
}

/** Ce que la pile retient d'une recherche, pour la retrouver telle quelle en y revenant. */
export interface DeckMemory {
  index: number;
  history: { actor: ActorSearchResult; decision: 'RETENU' | 'ECARTE' }[];
}

const COACH_KEY = 'aic.swipe.coach';

/**
 * Pile de propositions de l'IA, façon « swipe ».
 * La pile occupe toute la place que lui donne son parent : la fiche est dimensionnée par le conteneur, jamais coupée.
 * Geste : GSAP Draggable + InertiaPlugin (vitesse réelle du lancer), retour élastique, départ dans l'axe du geste.
 * Toujours une alternative visible : boutons ✕ / ✓, ↺ pour annuler, clavier ← → Retour arrière, ↑ pour le détail.
 */
@Component({
  selector: 'app-swipe-deck',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="wrap">
    @if (current()) {
      <div class="progress" aria-hidden="true">
        <div class="bar"><span [style.width.%]="progressPct()"></span></div>
        <span class="count"><b>{{ index() + 1 }}</b> / {{ results.length }}{{ hasMore ? '+' : '' }}</span>
        <span class="tally"><span class="t-ok">✓ {{ kept().length }}</span><span class="t-ko">✕ {{ rejectedCount() }}</span></span>
      </div>

      <div class="deck" role="group" [attr.aria-label]="'Proposition ' + (index() + 1) + ' sur ' + results.length">
        @for (a of visible(); track a.id; let k = $index) {
          <article class="card" [class.top]="k === 0" [class.b1]="k === 1" [class.b2]="k === 2"
                   [class.open]="k === 0 && details()" [attr.data-id]="a.id"
                   [attr.aria-hidden]="k !== 0" [style.z-index]="10 - k">
            <div class="photo">
              @if (photos(a).length) {
                <img [src]="photos(a)[k === 0 ? photoIndex() : 0]" alt="" draggable="false"
                     (error)="onImgError(photos(a)[k === 0 ? photoIndex() : 0])" />
              } @else {
                <div class="initials">{{ a.firstName[0] }}{{ a.lastName[0] }}</div>
              }
            </div>
            <div class="scrim" aria-hidden="true"></div>

            @if (k === 0 && photos(a).length > 1) {
              <div class="segments" aria-hidden="true">
                @for (p of photos(a); track p; let j = $index) { <span [class.on]="j === photoIndex()"></span> }
              </div>
            }
            <span class="score" [class.high]="a.score >= 0.75" [attr.aria-label]="pct(a.score) + ' % de correspondance'">
              <svg viewBox="0 0 36 36" aria-hidden="true"><circle class="trk" cx="18" cy="18" r="15.5"/>
                <circle class="val" cx="18" cy="18" r="15.5" pathLength="100" [style.stroke-dasharray]="pct(a.score) + ' 100'"/></svg>
              <b>{{ pct(a.score) }}</b>
            </span>

            <div class="body">
              <h3 class="name">{{ a.firstName }} {{ a.lastName }}@if (a.age) {<span class="age">{{ a.age }}</span>}</h3>
              <p class="meta">{{ metaOf(a) }}</p>
              @if (a.checks?.length) {
                <ul class="checks" [attr.aria-label]="'Critères de la demande'">
                  @for (c of a.checks; track c.label) {
                    <li [class.ko]="!c.ok"><span aria-hidden="true">{{ c.ok ? '✓' : '✗' }}</span>{{ c.label }}<span class="sr">{{ c.ok ? ' : rempli' : ' : non rempli' }}</span></li>
                  }
                </ul>
              }
              @if (explaining && index() + k < 5 && !a.reason) {
                <p class="reason shimmer">L’IA analyse ce profil…</p>
              } @else if (hasReason(a)) {
                <p class="reason">{{ a.reason }}</p>
              }
              @if (k === 0) {
                <div class="more"><div class="more-in">
                  <div class="tags">
                    @for (l of a.languages; track l) { <span class="tag lang">{{ l }}</span> }
                    @for (s of a.skills; track s) { <span class="tag">{{ s }}</span> }
                  </div>
                  <button type="button" class="dossier" (click)="open.emit(a.id)">Ouvrir le dossier complet</button>
                </div></div>
                <button type="button" class="expand" (click)="toggleDetails()" [attr.aria-expanded]="details()"
                        [attr.aria-label]="details() ? 'Réduire le détail' : 'Voir le détail du profil'">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>
                </button>
              }
            </div>

            @if (k === 0) {
              <span class="stamp ok" aria-hidden="true">Retenu</span>
              <span class="stamp ko" aria-hidden="true">Écarté</span>
            }
          </article>
        }
        @if (coach()) {
          <div class="coach" aria-hidden="true"><span>← Écarter</span><span class="hand">☝︎</span><span>Retenir →</span></div>
        }
      </div>

      <div class="actions">
        <button type="button" class="act undo" (click)="undo()" [disabled]="!history().length" aria-label="Annuler la dernière décision" title="Annuler (Retour arrière)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>
        </button>
        <button type="button" class="act ko" (click)="swipe('ECARTE')" aria-label="Écarter" title="Écarter (←)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <button type="button" class="act ok" (click)="swipe('RETENU')" aria-label="Retenir" title="Retenir (→)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>
        </button>
        <button type="button" class="act info" (click)="open.emit(current()!.id)" aria-label="Ouvrir le dossier" title="Ouvrir le dossier">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7"/><path d="M21 3l-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>
        </button>
      </div>
    } @else {
      <div class="done" role="status">
        <div class="done-mark" aria-hidden="true">✓</div>
        <div class="done-title">{{ kept().length ? 'Votre sélection est prête' : 'Vous avez vu toutes les propositions' }}</div>
        @if (kept().length) {
          <p class="done-sub">{{ kept().length }} profil{{ kept().length > 1 ? 's' : '' }} retenu{{ kept().length > 1 ? 's' : '' }} sur {{ history().length }}</p>
          <div class="kept">
            @for (a of kept(); track a.id) {
              <button type="button" class="kept-item" (click)="open.emit(a.id)">
                @if (photos(a).length) { <img [src]="photos(a)[0]" alt="" (error)="onImgError(photos(a)[0])" /> }
                @else { <span class="mini">{{ a.firstName[0] }}{{ a.lastName[0] }}</span> }
                <span>{{ a.firstName }} {{ a.lastName }}</span>
              </button>
            }
          </div>
        } @else {
          <p class="done-sub">Aucun profil retenu. Affinez la demande ou revoyez les propositions.</p>
        }
        <div class="done-actions">
          @if (hasMore) {
            <button type="button" class="pill primary" (click)="more.emit()" [disabled]="loadingMore">
              {{ loadingMore ? 'Chargement…' : 'Voir plus de propositions' }}
            </button>
          }
          <button type="button" class="pill" (click)="restart()">Revoir depuis le début</button>
        </div>
      </div>
    }
  </div>
  `,
  styles: [`
  :host { display: flex; flex-direction: column; flex: 1; min-height: 0; width: 100%; }
  /* La pile prend la hauteur que le parent lui laisse ; la fiche en découle (unités cqh), jamais l'inverse. */
  .wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; container-type: size; container-name: deckzone;
    user-select: none; -webkit-user-select: none; }
  .progress, .deck, .actions { width: min(100%, calc((100cqh - 104px) * .8)); min-width: min(100%, 260px); }

  .progress { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 12px; height: 26px; font-size: 12.5px; color: var(--text-muted); flex: none; }
  .bar { height: 4px; border-radius: 4px; background: var(--bg-hover); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); border-radius: 4px; transition: width .35s ease; }
  .count b { color: var(--text-primary); }
  .tally { display: flex; gap: 10px; font-weight: 700; }
  .t-ok { color: var(--keep); } .t-ko { color: var(--reject); }

  .deck { position: relative; flex: 1; min-height: 0; margin-top: 8px; --lift: 0; }
  .card { position: absolute; inset: 0 0 18px; border-radius: 20px; overflow: hidden; background: #2A2C32; isolation: isolate;
    box-shadow: 0 1px 2px rgba(0,0,0,.3), 0 18px 40px rgba(0,0,0,.28); will-change: transform; touch-action: none;
    transition: transform .32s cubic-bezier(.2,.8,.2,1), filter .32s; --ok: 0; --ko: 0; }
  .card.top { cursor: grab; }
  .card.top:active { cursor: grabbing; }
  .card.b1 { transform: translateY(calc(9px * (1 - var(--lift)))) scale(calc(.955 + .045 * var(--lift))); filter: brightness(calc(.82 + .18 * var(--lift))); }
  .card.b2 { transform: translateY(18px) scale(.91); filter: brightness(.68); }

  .photo { position: absolute; inset: 0; }
  .photo img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; display: block; pointer-events: none; }
  .initials { position: absolute; inset: 0; display: grid; place-items: center; padding-bottom: 30%; font-size: clamp(56px, 22cqh, 110px); font-weight: 700;
    font-stretch: var(--narrow); color: rgba(255,255,255,.5); background: radial-gradient(120% 80% at 30% 10%, #4A4D56, #26272C); }
  .scrim { position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(180deg, rgba(0,0,0,.38) 0, transparent 22%, transparent 50%, rgba(14,14,17,.7) 72%, rgba(14,14,17,.94) 100%); }
  .segments { position: absolute; top: 10px; left: 12px; right: 64px; display: flex; gap: 4px; z-index: 2; }
  .segments span { flex: 1; height: 3px; border-radius: 2px; background: rgba(255,255,255,.35); }
  .segments span.on { background: #fff; }

  .score { position: absolute; top: 10px; right: 10px; width: 46px; height: 46px; display: grid; place-items: center; z-index: 2;
    background: rgba(14,14,17,.55); border-radius: 50%; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
  .score svg { position: absolute; inset: 3px; width: 40px; height: 40px; transform: rotate(-90deg); }
  .score circle { fill: none; stroke-width: 3; }
  .score .trk { stroke: rgba(255,255,255,.18); }
  .score .val { stroke: #CFCBC2; stroke-linecap: round; }
  .score.high .val { stroke: var(--crayon-400); }
  .score b { font-size: 13px; color: #fff; font-weight: 800; }

  /* Infos posées sur la photo : la fiche garde toujours sa taille, le détail se déplie à l'intérieur */
  .body { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; padding: 16px 18px 18px; color: #F3F1EC;
    display: flex; flex-direction: column; gap: 7px; max-height: 100%; }
  .name { margin: 0; font-size: clamp(22px, 4.2cqh, 30px); line-height: 1.05; font-weight: 800; font-stretch: var(--narrow); padding-right: 40px;
    text-shadow: 0 1px 12px rgba(0,0,0,.35); }
  .age { font-weight: 400; margin-left: 10px; opacity: .9; }
  .meta { margin: 0; font-size: 13.5px; color: #D6D3CC; }
  .checks { list-style: none; margin: 2px 0 0; padding: 0; display: flex; gap: 5px; flex-wrap: wrap; max-height: 25px; overflow: hidden; }
  .checks li { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 999px;
    background: rgba(63,185,80,.26); color: #EAF7EC; white-space: nowrap; }
  .checks li span:first-child { color: #7EE08E; }
  .checks li.ko { background: rgba(228,104,93,.26); color: #F6DEDB; }
  .checks li.ko span:first-child { color: #FF9C92; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .reason { margin: 0; font-size: 13.5px; line-height: 1.45; color: #E2DFD8; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .shimmer { background: linear-gradient(90deg, #8E8B84 25%, #F3F1EC 50%, #8E8B84 75%); background-size: 200% 100%;
    -webkit-background-clip: text; background-clip: text; color: transparent; animation: sh 1.6s linear infinite; }
  @keyframes sh { to { background-position: -200% 0; } }

  .more { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .3s ease, opacity .25s ease; }
  .more-in { min-height: 0; overflow: hidden; display: flex; flex-direction: column; align-items: flex-start; }
  .card:not(.open) .more { margin-top: -7px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { font-size: 12px; padding: 3px 9px; border-radius: 6px; background: rgba(255,255,255,.12); color: #E2DFD8; }
  .tag.lang { background: rgba(255,255,255,.2); color: #fff; }
  .dossier { justify-self: start; margin-top: 10px; height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.4);
    background: transparent; color: #fff; font-weight: 600; font-size: 13px; cursor: pointer; }
  .dossier:hover { background: rgba(255,255,255,.12); }
  .card.open .scrim { background: linear-gradient(180deg, rgba(0,0,0,.38) 0, transparent 18%, rgba(14,14,17,.8) 45%, rgba(14,14,17,.96) 100%); }
  .card.open .reason { -webkit-line-clamp: 8; }
  .card.open .checks { max-height: none; }
  .card.open .more { grid-template-rows: 1fr; opacity: 1; }
  .card.open .body { overflow-y: auto; overscroll-behavior: contain; }
  .expand { position: absolute; right: 14px; top: 14px; width: 34px; height: 34px; border-radius: 50%; border: none; cursor: pointer;
    background: rgba(255,255,255,.16); color: #fff; display: grid; place-items: center; }
  .expand svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; transition: transform .3s; }
  .card.open .expand svg { transform: rotate(180deg); }
  .expand:hover { background: rgba(255,255,255,.26); }
  .card.open { touch-action: pan-y; cursor: default; }

  .stamp { position: absolute; top: 26px; z-index: 3; font-size: 30px; font-weight: 900; font-stretch: var(--narrow); padding: 2px 14px; border-radius: 8px;
    border: 4px solid; pointer-events: none; letter-spacing: .02em; }
  .stamp.ok { left: 18px; color: var(--crayon-400); border-color: var(--crayon-400); transform: rotate(-12deg) scale(calc(.8 + .2 * var(--ok))); opacity: var(--ok); }
  .stamp.ko { right: 18px; color: var(--rouge-300); border-color: var(--rouge-300); transform: rotate(12deg) scale(calc(.8 + .2 * var(--ko))); opacity: var(--ko); }

  .coach { position: absolute; left: 0; right: 0; top: 42%; display: flex; justify-content: space-between; align-items: center; padding: 0 14px;
    z-index: 20; pointer-events: none; color: #fff; font-weight: 700; font-size: 13px; }
  .coach span:not(.hand) { background: rgba(14,14,17,.7); padding: 6px 10px; border-radius: 999px; }
  .hand { font-size: 34px; text-shadow: 0 2px 10px rgba(0,0,0,.5); }

  .actions { flex: none; height: 72px; display: flex; justify-content: center; align-items: center; gap: 18px; }
  .act { border-radius: 50%; border: 1px solid var(--border); background: var(--bg-surface); cursor: pointer; display: grid; place-items: center;
    color: var(--text-muted); box-shadow: 0 6px 18px rgba(0,0,0,.18); transition: transform .15s, background .15s, color .15s, border-color .15s; }
  .act svg { fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; }
  .act:hover:not([disabled]) { transform: translateY(-2px); }
  .act:active:not([disabled]) { transform: scale(.92); }
  .act[disabled] { opacity: .35; cursor: default; box-shadow: none; }
  .act:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .act.undo, .act.info { width: 46px; height: 46px; }
  .act.undo svg, .act.info svg { width: 20px; height: 20px; stroke-width: 2.2; }
  .act.ko, .act.ok { width: 64px; height: 64px; }
  .act.ko svg, .act.ok svg { width: 28px; height: 28px; stroke-width: 3; }
  .act.ko { color: var(--reject); }
  .act.ko:hover:not([disabled]) { background: var(--reject); border-color: var(--reject); color: #fff; }
  .act.ok { background: var(--keep); border-color: var(--keep); color: #1F2024; }
  .act.ok:hover:not([disabled]) { background: var(--accent-hover); }

  .done { margin: auto; max-width: 460px; text-align: center; padding: 28px 20px; }
  .done-mark { width: 56px; height: 56px; margin: 0 auto 14px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; font-weight: 800;
    background: var(--keep); color: #1F2024; animation: pop .5s cubic-bezier(.34,1.56,.64,1) both; }
  @keyframes pop { from { transform: scale(.4); opacity: 0; } }
  .done-title { font-size: 22px; font-weight: 800; font-stretch: var(--narrow); color: var(--text-primary); }
  .done-sub { font-size: 13.5px; color: var(--text-muted); margin: 6px 0 16px; }
  .kept { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 18px; }
  .kept-item { display: flex; align-items: center; gap: 8px; padding: 3px 12px 3px 3px; border-radius: 999px; border: 2px solid var(--keep);
    background: transparent; color: var(--text-primary); cursor: pointer; font-size: 13px; }
  .kept-item:hover { background: var(--accent-dim); }
  .kept-item img, .mini { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; background: var(--bg-hover); display: grid; place-items: center; font-size: 11px; font-weight: 700; }
  .done-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .pill { border-radius: 999px; height: 40px; padding: 0 18px; border: 1px solid var(--border); background: transparent; color: var(--text-primary); cursor: pointer; font-size: 13.5px; }
  .pill:hover { background: var(--bg-hover); }
  .pill.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 700; }

  @container deckzone (max-height: 520px) {
    .actions { height: 64px; gap: 14px; }
    .act.ko, .act.ok { width: 54px; height: 54px; }
    .act.undo, .act.info { width: 40px; height: 40px; }
    .reason { -webkit-line-clamp: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .card, .act, .bar span, .more { transition: none; }
    .shimmer { animation: none; color: #E2DFD8; }
    .done-mark { animation: none; }
  }
  `]
})
export class SwipeDeckComponent implements AfterViewInit, OnDestroy {
  @Input() results: ActorSearchResult[] = [];
  @Input() explaining = false;
  @Input() hasMore = false;
  @Input() loadingMore = false;
  /** Seule la pile affichée répond au clavier. */
  @Input() active = false;
  /** Mémoire de la recherche (position, décisions) : on la retrouve en revenant sur cette recherche. */
  @Input() set memory(m: DeckMemory | undefined) {
    this.mem = m;
    if (m) { this.index.set(m.index); this.history.set([...m.history]); }
  }
  @Output() decide = new EventEmitter<SwipeEvent>();
  @Output() more = new EventEmitter<void>();
  @Output() open = new EventEmitter<string>();

  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly announcer = inject(LiveAnnouncer);
  private mem?: DeckMemory;

  index = signal(0);
  photoIndex = signal(0);
  details = signal(false);
  coach = signal(false);
  history = signal<{ actor: ActorSearchResult; decision: 'RETENU' | 'ECARTE' }[]>([]);

  current = computed(() => this.results[this.index()] ?? null);
  kept = computed(() => this.history().filter(h => h.decision === 'RETENU').map(h => h.actor));
  rejectedCount = computed(() => this.history().filter(h => h.decision === 'ECARTE').length);
  progressPct = computed(() => this.results.length ? (this.index() / this.results.length) * 100 : 0);

  private drag: Draggable | null = null;
  private dragEl: HTMLElement | null = null;
  private busy = false;
  private grabTop = true;
  private readonly still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private viewReady = false;

  constructor() {
    // À chaque nouvelle fiche du dessus : on (re)branche le geste dessus
    effect(() => {
      this.index(); this.current();
      untracked(() => { if (this.viewReady) this.bindTop(); });
    });
  }

  private readonly detailsSync = effect(() => {
    const open = this.details();
    untracked(() => {
      if (!this.drag || !this.dragEl) return;
      if (open) { this.drag.disable(); this.dragEl.style.touchAction = 'pan-y'; }
      else { this.drag.enable(); this.dragEl.style.touchAction = 'none'; }
    });
  });

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.bindTop();
    this.maybeCoach();
  }

  ngOnDestroy(): void { this.unbind(); }

  visible(): ActorSearchResult[] { return this.results.slice(this.index(), this.index() + 3); }

  /** Photos qui n'ont pas pu être chargées : on les retire pour afficher les initiales à la place. */
  private failed = signal<Set<string>>(new Set());
  photos(a: ActorSearchResult): string[] {
    const list = (a.photoUrls && a.photoUrls.length) ? a.photoUrls : (a.mainPhotoUrl ? [a.mainPhotoUrl] : []);
    const bad = this.failed();
    return list.filter(u => !bad.has(u)).slice(0, 5);
  }
  onImgError(url: string): void {
    if (!url || this.failed().has(url)) return;
    this.failed.update(s => new Set(s).add(url));
    this.photoIndex.set(0);
  }
  pct(score: number): number { return Math.round(score * 100); }
  /** L'avis de l'IA ; pas la simple liste ✓/✗ de repli, déjà montrée en pastilles. */
  hasReason(a: ActorSearchResult): boolean { return !!a.reason && !(a.checks?.length && /^[✓✗]/.test(a.reason.trim())); }
  metaOf(a: ActorSearchResult): string { return [a.city, a.gender].filter(x => !!x).join(' · '); }

  toggleDetails(): void { this.details.update(v => !v); }

  // ── Geste ──────────────────────────────────────────────
  private deckEl(): HTMLElement | null { return this.host.querySelector('.deck'); }
  private topEl(): HTMLElement | null { return this.host.querySelector('.card.top'); }

  private unbind(): void {
    if (this.drag) { this.drag.kill(); this.drag = null; }
    if (this.dragEl) { InertiaPlugin.untrack(this.dragEl); this.dragEl = null; }
  }

  private bindTop(): void {
    // Laisser Angular poser la nouvelle fiche, et la carte du dessous finir de monter
    setTimeout(() => {
      const el = this.topEl();
      if (!el || el === this.dragEl) return;
      this.unbind();
      el.style.transition = 'none';
      gsap.set(el, { x: 0, y: 0, rotation: 0, clearProps: 'transform' });
      requestAnimationFrame(() => { el.style.transition = ''; });
      this.dragEl = el;
      InertiaPlugin.track(el, 'x,y');
      const self = this;
      [this.drag] = Draggable.create(el, {
        type: 'x,y',
        minimumMovement: 6,
        allowContextMenu: true,
        dragClickables: false,
        zIndexBoost: false,
        onPress(e: PointerEvent) {
          if (self.busy) { this['endDrag'](e); return; }
          el.style.transition = 'none';
          const r = el.getBoundingClientRect();
          self.grabTop = e.clientY < r.top + r.height / 2;
          gsap.killTweensOf(el);
          self.coach.set(false);
        },
        onDrag() { self.follow(el, this['x'], this['y']); },
        onRelease() { self.release(el, this['x'], this['y']); },
        onClick(e: PointerEvent) { self.tap(el, e); }
      });
    }, 30);
  }

  private follow(el: HTMLElement, x: number, y: number): void {
    const w = el.offsetWidth || 320;
    gsap.set(el, { rotation: (x / w) * 22 * (this.grabTop ? 1 : -1), y: y * 0.35 });
    const p = Math.min(1, Math.abs(x) / (w * 0.35));
    el.style.setProperty('--ok', String(x > 0 ? p : 0));
    el.style.setProperty('--ko', String(x < 0 ? p : 0));
    this.deckEl()?.style.setProperty('--lift', String(Math.min(1, Math.abs(x) / (w * 0.5))));
  }

  private release(el: HTMLElement, x: number, y: number): void {
    const w = el.offsetWidth || 320;
    const vx = InertiaPlugin.getVelocity(el, 'x');   // px/s
    const fling = Math.abs(vx) > 650 && Math.sign(vx) === Math.sign(x) && Math.abs(x) > 24;
    if (x > w * 0.3 || (fling && x > 0)) this.fly(el, 'RETENU', vx, y);
    else if (x < -w * 0.3 || (fling && x < 0)) this.fly(el, 'ECARTE', vx, y);
    else this.springBack(el);
  }

  private springBack(el: HTMLElement): void {
    el.style.transition = 'none';
    gsap.to(el, { x: 0, y: 0, rotation: 0, duration: this.still ? 0 : 0.7, ease: 'elastic.out(1, 0.55)',
      onUpdate: () => this.follow(el, Number(gsap.getProperty(el, 'x')), 0) });
    gsap.to(el, { '--ok': 0, '--ko': 0, duration: 0.2 });
    const d = this.deckEl(); if (d) gsap.to(d, { '--lift': 0, duration: 0.3 });
  }

  private tap(el: HTMLElement, e: PointerEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('button')) return;
    const a = this.current(); if (!a) return;
    const r = el.getBoundingClientRect();
    if (e.clientY > r.top + r.height * 0.58) { this.toggleDetails(); return; }   // bas de fiche : le détail
    const n = this.photos(a).length; if (n < 2) return;                           // haut : photo suivante / précédente
    const next = e.clientX - r.left > r.width / 2 ? 1 : -1;
    this.photoIndex.set((this.photoIndex() + next + n) % n);
  }

  /** La fiche part dans le prolongement du geste, d'autant plus vite que le lancer est rapide. */
  private fly(el: HTMLElement, decision: 'RETENU' | 'ECARTE', vx = 0, y = 0): void {
    const a = this.current(); if (!a || this.busy) return;
    this.busy = true;
    this.drag?.disable();
    el.style.transition = 'none';
    const dir = decision === 'RETENU' ? 1 : -1;
    const w = el.offsetWidth || 320;
    const speed = Math.max(900, Math.abs(vx));
    const dist = w * 1.6;
    const dur = this.still ? 0.01 : Math.max(0.22, Math.min(0.45, dist / speed));
    navigator.vibrate?.(10);
    el.style.setProperty(decision === 'RETENU' ? '--ok' : '--ko', '1');
    const d = this.deckEl(); if (d) gsap.to(d, { '--lift': 1, duration: dur });
    gsap.to(el, {
      x: dir * dist, y: y * 0.35 + 40, rotation: dir * 26, duration: dur, ease: 'power1.in',
      onComplete: () => this.commit(a, decision)
    });
  }

  private commit(a: ActorSearchResult, decision: 'RETENU' | 'ECARTE'): void {
    this.unbind();
    this.history.update(h => [...h, { actor: a, decision }]);
    this.decide.emit({ actor: a, decision });
    this.announcer.announce(`${a.firstName} ${a.lastName} ${decision === 'RETENU' ? 'retenu' : 'écarté'}`);
    this.details.set(false);
    this.photoIndex.set(0);
    this.index.update(i => i + 1);
    this.save();
    this.deckEl()?.style.setProperty('--lift', '0');
    this.busy = false;
  }

  /** Boutons et clavier : petite anticipation puis même départ que le geste. */
  swipe(decision: 'RETENU' | 'ECARTE'): void {
    const el = this.topEl();
    if (!el || this.busy) return;
    this.coach.set(false);
    gsap.killTweensOf(el);
    el.style.transition = 'none';
    const dir = decision === 'RETENU' ? 1 : -1;
    if (this.still) { this.fly(el, decision, 2400); return; }
    gsap.to(el, { x: -dir * 14, rotation: -dir * 3, duration: 0.09, ease: 'power1.out', onComplete: () => this.fly(el, decision, 2200) });
  }

  undo(): void {
    const h = this.history();
    if (!h.length || this.busy) return;
    const last = h[h.length - 1];
    this.history.set(h.slice(0, -1));
    this.details.set(false);
    this.photoIndex.set(0);
    this.index.update(i => Math.max(0, i - 1));
    this.save();
    this.decide.emit({ actor: last.actor, decision: 'ANNULE' });
    this.announcer.announce(`Décision annulée : ${last.actor.firstName} ${last.actor.lastName}`);
    // La fiche revient du côté où elle était partie
    const dir = last.decision === 'RETENU' ? 1 : -1;
    setTimeout(() => {
      const el = this.topEl(); if (!el || this.still) return;
      el.style.transition = 'none';
      gsap.fromTo(el, { x: dir * (el.offsetWidth || 320) * 1.3, rotation: dir * 20, y: 30 },
        { x: 0, y: 0, rotation: 0, duration: 0.5, ease: 'back.out(1.3)', clearProps: 'transform',
          onComplete: () => { el.style.transition = ''; } });
    }, 0);
  }

  restart(): void {
    this.index.set(0); this.photoIndex.set(0); this.history.set([]); this.details.set(false); this.save();
  }

  private save(): void {
    if (this.mem) { this.mem.index = this.index(); this.mem.history = [...this.history()]; }
  }

  /** Première fois : la fiche montre elle-même le geste, puis l'aide disparaît pour de bon. */
  private maybeCoach(): void {
    let seen = true;
    try { seen = !!localStorage.getItem(COACH_KEY); localStorage.setItem(COACH_KEY, '1'); } catch { /* stockage indisponible */ }
    if (seen || this.still || !this.current()) return;
    this.coach.set(true);
    setTimeout(() => {
      const el = this.topEl(); if (!el) return;
      el.style.transition = 'none';
      gsap.timeline({ delay: 0.5, onComplete: () => { gsap.set(el, { clearProps: 'transform' }); el.style.transition = ''; setTimeout(() => this.coach.set(false), 900); } })
        .to(el, { x: 70, rotation: 5, duration: 0.45, ease: 'power2.out', onUpdate: () => this.follow(el, Number(gsap.getProperty(el, 'x')), 0) })
        .to(el, { x: -70, rotation: -5, duration: 0.6, ease: 'power2.inOut', onUpdate: () => this.follow(el, Number(gsap.getProperty(el, 'x')), 0) })
        .to(el, { x: 0, rotation: 0, duration: 0.6, ease: 'elastic.out(1, 0.6)', onUpdate: () => this.follow(el, Number(gsap.getProperty(el, 'x')), 0) });
    }, 120);
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!this.active || !this.current()) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); this.swipe('RETENU'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.swipe('ECARTE'); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); this.details.set(e.key === 'ArrowUp'); }
    else if (e.key === 'Backspace') { e.preventDefault(); this.undo(); }
  }
}
