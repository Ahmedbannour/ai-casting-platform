import {
  Component, EventEmitter, HostListener, Input, Output, computed, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActorSearchResult } from '../../../core/services/ai-search.service';

export type SwipeDecision = 'RETENU' | 'ECARTE' | 'ANNULE';

export interface SwipeEvent {
  actor: ActorSearchResult;
  decision: SwipeDecision;
}

/**
 * Pile de propositions de l'IA, façon « swipe » :
 * glisser à droite = retenir, à gauche = écarter. Boutons, clavier (← →, Retour arrière) et annulation.
 */
@Component({
  selector: 'app-swipe-deck',
  standalone: true,
  imports: [CommonModule],
  template: `
  <div class="deck-wrap">
    <div class="deck-head">
      @if (current()) {
        <span class="counter">Proposition <b>{{ index() + 1 }}</b> / {{ results.length }}{{ hasMore ? '+' : '' }}</span>
      } @else {
        <span class="counter">Sélection terminée</span>
      }
      <span class="tally">
        <span class="t-ok">✓ {{ kept().length }}</span>
        <span class="t-ko">✕ {{ rejectedCount() }}</span>
      </span>
    </div>

    @if (current()) {
      <div class="deck" role="group" aria-label="Propositions de l'IA">
        @for (a of visible(); track a.id; let k = $index) {
          <article class="card"
               [class.top]="k === 0"
               [class.leaving-right]="k === 0 && leaving() === 'RETENU'"
               [class.leaving-left]="k === 0 && leaving() === 'ECARTE'"
               [class.dragging]="k === 0 && dragging()"
               [class.spring]="k === 0 && springing()"
               [style.--exit]="exitMs + 'ms'"
               [style.z-index]="10 - k"
               [style.transform]="k === 0 ? topTransform() : backTransform(k)"
               (pointerdown)="k === 0 && onDown($event)"
               (pointermove)="k === 0 && onMove($event)"
               (pointerup)="k === 0 && onUp($event)"
               (pointercancel)="k === 0 && reset()">

            <div class="photo">
              @if (photos(a).length) {
                <img [src]="photos(a)[k === 0 ? photoIndex() : 0]" alt="" draggable="false" (error)="onImgError(photos(a)[k === 0 ? photoIndex() : 0])" />
              } @else {
                <div class="initials">{{ a.firstName[0] }}{{ a.lastName[0] }}</div>
              }
              @if (k === 0 && photos(a).length > 1) {
                <div class="segments">
                  @for (p of photos(a); track p; let j = $index) {
                    <span [class.on]="j === photoIndex()"></span>
                  }
                </div>
              }
              <div class="film" aria-hidden="true"><span class="holes"></span></div>
              <div class="edge">
                <span class="rank">N° {{ index() + k + 1 }}</span>
                <span class="score" [class.high]="a.score >= 0.75">{{ pct(a.score) }} % de correspondance</span>
              </div>
              @if (k === 0) {
                <!-- Marques au crayon gras : elles se dessinent pendant le glissement -->
                <svg class="mark ok" [style.opacity]="stampOk() > 0.02 ? 1 : 0" viewBox="0 0 200 200" preserveAspectRatio="none" aria-hidden="true">
                  <path pathLength="1" [style.stroke-dashoffset]="1 - stampOk()"
                        d="M104 18 C 52 16, 14 52, 16 104 C 18 156, 62 186, 108 184 C 156 182, 188 146, 186 98 C 184 52, 150 20, 96 24" />
                </svg>
                <svg class="mark ko" [style.opacity]="stampKo() > 0.02 ? 1 : 0" viewBox="0 0 200 200" preserveAspectRatio="none" aria-hidden="true">
                  <path pathLength="1" [style.stroke-dashoffset]="1 - stampKo()" d="M30 34 L 172 168" />
                  <path pathLength="1" [style.stroke-dashoffset]="1 - stampKo()" d="M170 30 L 34 170" />
                </svg>
                <span class="mark-label ok" [style.opacity]="stampOk()">Retenu</span>
                <span class="mark-label ko" [style.opacity]="stampKo()">Écarté</span>
              }
            </div>

            <div class="info">
              <div class="name">{{ a.firstName }} {{ a.lastName }}</div>
              <div class="meta">
                @if (a.age) { <span>{{ a.age }} ans</span> }
                @if (a.city) { <span>· {{ a.city }}</span> }
                @if (a.gender) { <span>· {{ a.gender }}</span> }
              </div>
              <div class="tags">
                @for (l of a.languages.slice(0, 3); track l) { <span class="tag lang">{{ l }}</span> }
                @for (s of a.skills.slice(0, 2); track s) { <span class="tag skill">{{ s }}</span> }
              </div>
              @if (explaining && index() + k < 5) {
                <div class="reason shimmer">L’IA analyse ce profil…</div>
              } @else {
                <div class="reason">{{ a.reason }}</div>
              }
            </div>
          </article>
        }
      </div>

      <div class="actions">
        <button type="button" class="act undo" (click)="undo()" [disabled]="!history().length" aria-label="Annuler la dernière décision" title="Annuler (Retour arrière)">↺</button>
        <button type="button" class="act ko" (click)="swipe('ECARTE')" aria-label="Écarter" title="Écarter (←)">✕</button>
        <button type="button" class="act info" (click)="open.emit(current()!.id)" aria-label="Voir le dossier" title="Voir le dossier">i</button>
        <button type="button" class="act ok" (click)="swipe('RETENU')" aria-label="Retenir" title="Retenir (→)">✓</button>
      </div>
      <p class="hint">Glissez à droite pour retenir, à gauche pour écarter. Touchez la photo pour voir la suivante.</p>
    } @else {
      <div class="done">
        <div class="done-title">Vous avez vu toutes les propositions</div>
        @if (kept().length) {
          <p class="done-sub">{{ kept().length }} profil(s) retenu(s)</p>
          <div class="kept">
            @for (a of kept(); track a.id) {
              <button type="button" class="kept-item" (click)="open.emit(a.id)">
                @if (photos(a).length) { <img [src]="photos(a)[0]" alt="" (error)="onImgError(photos(a)[0])" /> }
                @else { <span class="mini-initials">{{ a.firstName[0] }}{{ a.lastName[0] }}</span> }
                <span>{{ a.firstName }} {{ a.lastName }}</span>
              </button>
            }
          </div>
        } @else {
          <p class="done-sub">Aucun profil retenu pour l’instant.</p>
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
  :host { display: block; }
  .deck-wrap { width: 100%; max-width: 380px; margin: 4px 0 0; user-select: none; }
  .deck-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; color: var(--text-muted); margin-bottom: 10px; }
  .counter b { color: var(--text-primary); font-weight: 600; }
  .tally { display: flex; gap: 12px; font-weight: 600; }
  .t-ok { color: var(--keep); } .t-ko { color: var(--reject); }

  .deck { position: relative; height: 500px; }
  .card { position: absolute; inset: 0; border-radius: var(--radius-m); overflow: hidden; background: var(--bg-surface);
    border: 1px solid var(--border); box-shadow: var(--shadow); touch-action: none;
    transition: transform .35s cubic-bezier(.2,.8,.2,1), opacity .35s; display: flex; flex-direction: column; will-change: transform; }
  .card.top { cursor: grab; }
  .card.dragging { transition: none; cursor: grabbing; }
  .card.dragging { box-shadow: 0 34px 70px rgba(0,0,0,.45); }
  .card.spring { transition: transform .5s cubic-bezier(.34,1.56,.64,1), opacity .35s; }
  .card.leaving-right, .card.leaving-left { opacity: 0; transition: transform var(--exit, 320ms) cubic-bezier(.22,.61,.36,1), opacity var(--exit, 320ms) ease-in; }

  .photo { position: relative; flex: 1; min-height: 0; background: #3A3C43; }
  .photo img { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }
  .initials { position: absolute; inset: 0; display: grid; place-items: center; font-size: 76px; font-weight: 700;
    font-stretch: var(--narrow); color: rgba(255,255,255,.55); }
  .segments { position: absolute; top: 10px; left: 12px; right: 12px; display: flex; gap: 4px; }
  .segments span { flex: 1; height: 3px; border-radius: 2px; background: rgba(255,255,255,.35); }
  .segments span.on { background: #fff; }

  /* Bande de pellicule : rang et correspondance */
  .film { position: absolute; left: 0; right: 0; bottom: 30px; height: 8px; background: rgba(12,12,14,.78); }
  .holes { position: absolute; inset: 2px 6px; background: repeating-linear-gradient(90deg, rgba(255,255,255,.5) 0 6px, transparent 6px 14px); border-radius: 1px; }
  .edge { position: absolute; left: 0; right: 0; bottom: 0; height: 30px; padding: 0 12px; display: flex; align-items: center;
    justify-content: space-between; background: rgba(12,12,14,.78); color: #E9E7E1; font-size: 12px; }
  .rank { font-weight: 700; font-stretch: var(--narrow); font-size: 13px; }
  .score { color: #BDBAB2; } .score.high { color: #F2C230; }

  /* Crayon gras */
  .mark { position: absolute; inset: 6% 8% 12%; width: 84%; height: 82%; pointer-events: none; overflow: visible; }
  .mark path { fill: none; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1 1; }
  .mark.ok path { stroke: #F2C230; filter: drop-shadow(0 1px 1px rgba(0,0,0,.35)); }
  .mark.ko path { stroke: #E4685D; filter: drop-shadow(0 1px 1px rgba(0,0,0,.35)); }
  .mark-label { position: absolute; top: 14px; font-size: 26px; font-weight: 800; font-stretch: var(--narrow); padding: 0 10px; border-radius: 4px; pointer-events: none; }
  .mark-label.ok { left: 14px; background: #F2C230; color: #1F2024; transform: rotate(-4deg); }
  .mark-label.ko { right: 14px; background: #E4685D; color: #1F2024; transform: rotate(4deg); }

  .info { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 6px; background: var(--bg-surface); }
  .name { font-size: 24px; line-height: 1.1; font-weight: 700; font-stretch: var(--narrow); color: var(--text-primary); }
  .meta { font-size: 13px; color: var(--text-muted); display: flex; gap: 4px; flex-wrap: wrap; }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .tag { font-size: 11.5px; padding: 1px 8px; border-radius: var(--radius-s); background: var(--bg-hover); color: var(--text-muted); }
  .tag.lang { color: var(--text-primary); }
  .reason { font-size: 13px; line-height: 1.45; color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .shimmer { background: linear-gradient(90deg, var(--text-subtle) 25%, var(--text-primary) 50%, var(--text-subtle) 75%); background-size: 200% 100%;
    -webkit-background-clip: text; background-clip: text; color: transparent; animation: sh 1.6s linear infinite; }
  @keyframes sh { to { background-position: -200% 0; } }

  .actions { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 16px; }
  .act { border-radius: 50%; border: 1px solid var(--border); background: var(--bg-surface); cursor: pointer; font-weight: 700;
    display: grid; place-items: center; transition: transform .15s, background .15s, color .15s; }
  .act:hover:not([disabled]) { transform: scale(1.08); }
  .act:active:not([disabled]) { transform: scale(.94); }
  .act[disabled] { opacity: .35; cursor: default; }
  .act:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .act.ko, .act.ok { width: 60px; height: 60px; font-size: 24px; }
  .act.ko { color: var(--reject); } .act.ko:hover:not([disabled]) { background: var(--reject); color: var(--on-accent); border-color: var(--reject); }
  .act.ok { background: var(--keep); border-color: var(--keep); color: #1F2024; }
  .act.ok:hover:not([disabled]) { background: var(--accent-hover); }
  .act.undo, .act.info { width: 42px; height: 42px; font-size: 17px; color: var(--text-muted); }
  .act.info { font-family: Georgia, serif; font-style: italic; }
  .hint { text-align: center; font-size: 12px; color: var(--text-subtle); margin-top: 10px; }

  .done { border: 1px solid var(--border); border-radius: var(--radius-m); padding: 24px 18px; text-align: center; background: var(--bg-surface); }
  .done-title { font-size: 20px; font-weight: 700; font-stretch: var(--narrow); color: var(--text-primary); }
  .done-sub { font-size: 13px; color: var(--text-muted); margin: 6px 0 14px; }
  .kept { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 16px; }
  .kept-item { display: flex; align-items: center; gap: 8px; padding: 3px 12px 3px 3px; border-radius: 999px; border: 2px solid var(--keep);
    background: transparent; color: var(--text-primary); cursor: pointer; font-size: 13px; }
  .kept-item:hover { background: var(--accent-dim); }
  .kept-item img, .mini-initials { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; background: var(--bg-hover); color: var(--text-primary); display: grid; place-items: center; font-size: 11px; font-weight: 700; }
  .done-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .pill { border-radius: var(--radius-s); padding: 8px 16px; border: 1px solid var(--border); background: transparent; color: var(--text-primary); cursor: pointer; font-size: 13.5px; }
  .pill:hover { background: var(--bg-hover); }
  .pill.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
  .pill.primary:hover { background: var(--accent-hover); }
  @media (prefers-reduced-motion: reduce) { .card, .act { transition: none; } .shimmer { animation: none; color: var(--text-muted); } }
  @container page (max-width: 480px) { .deck { height: 440px; } }
  `]
})
export class SwipeDeckComponent {
  @Input() results: ActorSearchResult[] = [];
  @Input() explaining = false;
  @Input() hasMore = false;
  @Input() loadingMore = false;
  /** Seule la pile active répond au clavier. */
  @Input() active = false;
  @Output() decide = new EventEmitter<SwipeEvent>();
  @Output() more = new EventEmitter<void>();
  @Output() open = new EventEmitter<string>();

  index = signal(0);
  photoIndex = signal(0);
  leaving = signal<SwipeDecision | null>(null);
  dragging = signal(false);
  dx = signal(0);
  dy = signal(0);
  history = signal<{ actor: ActorSearchResult; decision: SwipeDecision }[]>([]);

  private startX = 0;
  private startY = 0;
  private moved = false;
  // Geste : inclinaison selon l'endroit saisi, lancer selon la vitesse, retour avec rebond
  private grabTop = true;
  private trail: { x: number; t: number }[] = [];
  private armed = false;
  exitMs = 320;
  springing = signal(false);

  current = computed(() => this.results[this.index()] ?? null);
  kept = computed(() => this.history().filter(h => h.decision === 'RETENU').map(h => h.actor));
  rejectedCount = computed(() => this.history().filter(h => h.decision === 'ECARTE').length);
  stampOk = computed(() => Math.max(0, Math.min(1, this.dx() / 110)));
  stampKo = computed(() => Math.max(0, Math.min(1, -this.dx() / 110)));

  visible(): ActorSearchResult[] {
    return this.results.slice(this.index(), this.index() + 3);
  }

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

  topTransform(): string {
    const tilt = (this.dx() / 17) * (this.grabTop ? 1 : -1);
    const y = this.leaving() ? this.dy() : this.dy() * 0.3;
    const lift = this.dragging() ? 1.03 : 1;
    return `translate3d(${this.dx()}px, ${y}px, 0) rotate(${tilt}deg) scale(${lift})`;
  }

  backTransform(k: number): string {
    const lift = this.leaving() ? 1 : Math.min(1, Math.abs(this.dx()) / 140);
    const s = 1 - k * 0.05 + lift * 0.05 * (k === 1 ? 1 : 0);
    const y = k * 14 - lift * 14 * (k === 1 ? 1 : 0);
    return `translateY(${y}px) scale(${s})`;
  }

  onDown(e: PointerEvent): void {
    if (this.leaving()) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    this.grabTop = e.clientY < r.top + r.height / 2;
    this.startX = e.clientX; this.startY = e.clientY; this.moved = false;
    this.trail = [{ x: e.clientX, t: e.timeStamp }]; this.armed = false;
    this.springing.set(false); this.dragging.set(true);
  }

  onMove(e: PointerEvent): void {
    if (!this.dragging()) return;
    const dx = e.clientX - this.startX, dy = e.clientY - this.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) this.moved = true;
    this.dx.set(dx); this.dy.set(dy);
    this.trail.push({ x: e.clientX, t: e.timeStamp }); if (this.trail.length > 6) this.trail.shift();
    const over = Math.abs(dx) > 110;
    if (over !== this.armed) { this.armed = over; if (over) navigator.vibrate?.(6); }
  }

  onUp(e: PointerEvent): void {
    if (!this.dragging()) return;
    this.dragging.set(false);
    if (!this.moved) { this.tapPhoto(e); this.reset(); return; }
    const a = this.trail[0], b = this.trail[this.trail.length - 1];
    const v = a && b && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;   // px/ms
    const d = this.dx(), fling = Math.abs(v) > 0.55 && Math.sign(v) === Math.sign(d) && Math.abs(d) > 24;
    if (d > 110 || (fling && d > 0)) this.swipe('RETENU', v);
    else if (d < -110 || (fling && d < 0)) this.swipe('ECARTE', v);
    else { this.springing.set(true); this.reset(); setTimeout(() => this.springing.set(false), 520); }
  }

  reset(): void { this.dragging.set(false); this.dx.set(0); this.dy.set(0); }

  private tapPhoto(e: PointerEvent): void {
    const a = this.current(); if (!a) return;
    const n = this.photos(a).length; if (n < 2) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const next = e.clientX - rect.left > rect.width / 2 ? 1 : -1;
    this.photoIndex.set((this.photoIndex() + next + n) % n);
  }

  swipe(decision: 'RETENU' | 'ECARTE', v = 0): void {
    const a = this.current();
    if (!a || this.leaving()) return;
    // La fiche part dans le prolongement du geste, d'autant plus vite que le lancer est rapide
    const speed = Math.min(2.4, Math.max(0.6, Math.abs(v)));
    this.exitMs = Math.round(Math.max(200, Math.min(360, 400 - speed * 85)));
    const dir = decision === 'RETENU' ? 1 : -1;
    const ratio = Math.abs(this.dx()) > 20 ? this.dy() / Math.abs(this.dx()) : 0.08;
    this.dragging.set(false); this.springing.set(false);
    this.dx.set(dir * 760); this.dy.set(Math.max(-240, Math.min(240, ratio * 760)) + 30);
    navigator.vibrate?.(10);
    this.leaving.set(decision);
    setTimeout(() => {
      this.history.update(h => [...h, { actor: a, decision }]);
      this.decide.emit({ actor: a, decision });
      this.index.update(i => i + 1);
      this.photoIndex.set(0);
      this.leaving.set(null);
      this.reset();
    }, this.exitMs);
  }

  undo(): void {
    const h = this.history();
    if (!h.length || this.leaving()) return;
    const last = h[h.length - 1];
    this.history.set(h.slice(0, -1));
    this.index.update(i => Math.max(0, i - 1));
    this.photoIndex.set(0);
    this.decide.emit({ actor: last.actor, decision: 'ANNULE' });
  }

  restart(): void {
    this.index.set(0); this.photoIndex.set(0); this.history.set([]);
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!this.active || !this.current()) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); this.swipe('RETENU'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.swipe('ECARTE'); }
    else if (e.key === 'Backspace') { e.preventDefault(); this.undo(); }
  }
}
