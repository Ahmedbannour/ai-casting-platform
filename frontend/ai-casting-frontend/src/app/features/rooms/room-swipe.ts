import { Component, ElementRef, HostListener, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RoomRole, RoomService, SwipeCard, Vote } from '../../core/services/room.service';

/**
 * Swipe de la room : la shortlist d'un rôle, une carte à la fois.
 * Glisser à droite = Oui, à gauche = Non, vers le haut = Coup de cœur ; boutons et flèches du clavier aussi ; annuler le dernier vote.
 * Quand tous les côtés (marque, agence, réalisateur) ont dit oui : « C'est un match ! ».
 */
@Component({
  selector: 'app-room-swipe',
  standalone: true,
  template: `
  <div class="roles" role="tablist" aria-label="Rôle à swiper">
    @for (r of roles(); track r.id) {
      <button type="button" role="tab" [class.on]="r.id === roleId()" [attr.aria-selected]="r.id === roleId()" (click)="pick(r.id)">
        {{ r.name }} @if (r.toSwipe) { <span class="n">{{ r.toSwipe }}</span> } @else if (r.candidates) { <span class="ok" aria-label="tout vu">✓</span> }
      </button>
    }
  </div>
  @if (role(); as r) {
    @if (r.intention) { <p class="intent"><b>Intention</b> {{ r.intention }}</p> }
  }

  <div class="stage" [class.empty]="!loading() && !cards().length">
    @if (loading()) {
      <div class="card skel" aria-hidden="true"></div>
    } @else if (!cards().length) {
      <div class="done">
        <span class="ring" aria-hidden="true"></span>
        @if (role()?.candidates) {
          <h3>Vous avez tout vu pour ce rôle</h3>
          <p>Vos votes sont enregistrés. Regardez où en est l'équipe dans les résultats.</p>
          <button type="button" class="primary" (click)="showResults.emit(roleId()!)">Voir les résultats</button>
        } @else {
          <h3>Pas encore de candidats</h3>
          <p>La production ajoute les candidats à la shortlist du rôle ; ils apparaîtront ici pour être swipés.</p>
        }
        @if (last()) { <button type="button" class="ghost" (click)="undo()">Revenir sur mon dernier vote</button> }
      </div>
    } @else {
      @for (c of visible(); track c.entryId; let i = $index) {
        <article class="card" [class.top]="i === 0" [style.--i]="i" [class.fly]="i === 0 && flying()"
                 [style.transform]="i === 0 ? cardTransform() : null"
                 (pointerdown)="i === 0 && down($event)" [attr.aria-hidden]="i !== 0" [attr.aria-label]="i === 0 ? c.name : null">
          <div class="photo" [style.background-image]="c.photoUrl ? 'url(' + c.photoUrl + ')' : null">
            @if (!c.photoUrl) { <span class="initials">{{ initials(c.name) }}</span> }
            @if (i === 0) {
              <span class="stamp yes" [style.opacity]="hint() === 'OUI' ? hintStrength() : 0">OUI</span>
              <span class="stamp no" [style.opacity]="hint() === 'NON' ? hintStrength() : 0">NON</span>
              <span class="stamp heart" [style.opacity]="hint() === 'COEUR' ? hintStrength() : 0">COUP DE CŒUR</span>
            }
          </div>
          <div class="info">
            <h3>{{ c.name }}</h3>
            <p class="meta">{{ meta(c) }}</p>
            @if (c.languages.length || c.skills.length) {
              <div class="chips">@for (l of c.languages.slice(0, 3); track l) { <i>{{ l }}</i> }@for (s of c.skills.slice(0, 2); track s) { <i class="sk">{{ s }}</i> }</div>
            }
            @if (c.note) { <p class="note"><b>Production</b> {{ c.note }}</p> }
            @else if (c.bio) { <p class="bio">{{ c.bio }}</p> }
          </div>
        </article>
      }
    }
  </div>

  @if (cards().length) {
    <div class="actions">
      <button type="button" class="act undo" (click)="undo()" [disabled]="!last() || busy()" aria-label="Annuler mon dernier vote" title="Annuler (Retour arrière)">
        <svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg></button>
      <button type="button" class="act no" (click)="vote('NON')" [disabled]="busy()" aria-label="Non" title="Non (flèche gauche)">
        <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <button type="button" class="act heart" (click)="vote('COEUR')" [disabled]="busy()" aria-label="Coup de cœur" title="Coup de cœur (flèche haut)">
        <svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg></button>
      <button type="button" class="act yes" (click)="vote('OUI')" [disabled]="busy()" aria-label="Oui" title="Oui (flèche droite)">
        <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button>
    </div>
    <p class="keys">Glissez la carte, ou utilisez ← Non · ↑ Coup de cœur · → Oui</p>
  }
  @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

  @if (match(); as m) {
    <div class="match" role="dialog" aria-modal="true" aria-label="C'est un match" (click)="match.set(null)">
      <div class="burst" aria-hidden="true">@for (k of confetti; track $index) { <i [style.--a]="k.a" [style.--r]="k.r" [class.alt]="k.alt"></i> }</div>
      <div class="m-in" (click)="$event.stopPropagation()">
        <div class="m-photo" [style.background-image]="m.photoUrl ? 'url(' + m.photoUrl + ')' : null">
          @if (!m.photoUrl) { <span class="initials">{{ initials(m.name) }}</span> }
          <svg class="m-ring" viewBox="0 0 200 200" aria-hidden="true"><path pathLength="100" d="M100 18 C 150 16, 184 54, 182 102 C 180 150, 140 184, 96 182 C 50 180, 16 142, 20 96 C 24 54, 58 22, 104 22 C 120 23, 132 28, 140 34"/></svg>
        </div>
        <h2>C'est un match !</h2>
        <p>Toute l'équipe a dit oui pour <b>{{ m.name }}</b>.</p>
        <div class="m-act">
          <button type="button" class="ghost" (click)="match.set(null)">Continuer à swiper</button>
          <button type="button" class="primary" (click)="match.set(null); showResults.emit(roleId()!)">Voir les résultats</button>
        </div>
      </div>
    </div>
  }
  `,
  styles: [`
  :host { display: flex; flex-direction: column; gap: 14px; align-items: center; }
  .roles { align-self: stretch; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
  .roles button { flex: none; height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--glass);
    color: var(--text-muted); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all .15s; }
  .roles button.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .roles .n { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; display: grid; place-items: center; font-size: 11.5px;
    background: color-mix(in srgb, currentColor 16%, transparent); }
  .roles .ok { font-size: 12px; }
  .intent { align-self: stretch; margin: 0; font-size: 13.5px; color: var(--text-muted); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .intent b { color: var(--accent-ink); margin-right: 6px; font-size: 12px; }

  /* La carte et ses boutons tiennent dans l'écran visible (en-tête, onglets et barre du bas déduits). */
  .stage { position: relative; width: min(360px, 100%, max(220px, calc((100dvh - 330px) * .72))); aspect-ratio: 3 / 4.15; touch-action: none; }
  .stage.empty { aspect-ratio: auto; touch-action: auto; }
  .card { position: absolute; inset: 0; border-radius: 22px; overflow: hidden; background: var(--bg-secondary); border: 1px solid var(--border);
    box-shadow: 0 18px 44px color-mix(in srgb, var(--graphite-950) 30%, transparent); display: flex; flex-direction: column;
    transform: translateY(calc(var(--i) * 10px)) scale(calc(1 - var(--i) * .05)); transition: transform .3s cubic-bezier(.2,.8,.2,1), opacity .3s;
    z-index: calc(10 - var(--i)); user-select: none; -webkit-user-select: none; }
  .card:not(.top) { pointer-events: none; }
  .card.top { cursor: grab; transition: none; animation: cardIn .35s cubic-bezier(.2,1.2,.4,1); }
  .card.top:active { cursor: grabbing; }
  .card.fly { transition: transform .32s ease-in, opacity .32s ease-in; opacity: 0; }
  @keyframes cardIn { from { transform: translateY(10px) scale(.95); } }
  .card.skel { background: linear-gradient(90deg, var(--glass) 0%, var(--bg-secondary) 50%, var(--glass) 100%); background-size: 200% 100%; animation: sk 1.2s linear infinite; }
  @keyframes sk { to { background-position: -200% 0; } }
  .photo { position: relative; flex: 1; background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 30%, var(--graphite-700)), var(--graphite-850));
    background-size: cover; background-position: center 25%; display: grid; place-items: center; }
  .initials { font-size: 64px; font-weight: 800; color: color-mix(in srgb, var(--paper) 80%, transparent); font-stretch: 82%; }
  .stamp { position: absolute; top: 22px; padding: 6px 14px; border-radius: 10px; border: 3px solid; font-weight: 900; font-size: 22px; letter-spacing: .04em;
    background: color-mix(in srgb, var(--graphite-950) 35%, transparent); transition: opacity .08s; pointer-events: none; }
  .stamp.yes { left: 18px; color: var(--vert-300); border-color: var(--vert-300); transform: rotate(-12deg); }
  .stamp.no { right: 18px; color: var(--rouge-300); border-color: var(--rouge-300); transform: rotate(12deg); }
  .stamp.heart { left: 50%; top: auto; bottom: 22px; translate: -50% 0; color: var(--crayon-300); border-color: var(--crayon-300); font-size: 18px; }
  .info { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 6px; background: var(--bg-secondary); }
  .info h3 { margin: 0; font-size: 22px; font-stretch: 82%; }
  .meta { margin: 0; font-size: 13.5px; color: var(--text-muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chips i { font-style: normal; font-size: 11.5px; font-weight: 600; padding: 3px 9px; border-radius: 999px; background: var(--accent-dim); color: var(--accent-ink); }
  .chips i.sk { background: color-mix(in srgb, var(--text-subtle) 16%, transparent); color: var(--text-secondary); }
  .bio, .note { margin: 0; font-size: 13px; color: var(--text-secondary); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .note b { color: var(--accent-ink); margin-right: 4px; }

  .actions { display: flex; align-items: center; gap: 16px; }
  @media (max-width: 760px) { :host { gap: 10px; } .actions { gap: 12px; } }
  .act { width: 58px; height: 58px; border-radius: 50%; border: 1px solid var(--border); background: var(--bg-secondary); display: grid; place-items: center; cursor: pointer;
    box-shadow: 0 8px 22px color-mix(in srgb, var(--graphite-950) 18%, transparent); transition: transform .15s cubic-bezier(.2,1.4,.4,1), background .15s; }
  .act svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  .act:hover:not(:disabled) { transform: translateY(-3px) scale(1.06); }
  .act:active:not(:disabled) { transform: scale(.9); }
  .act:disabled { opacity: .4; cursor: default; }
  .act.undo { width: 44px; height: 44px; color: var(--text-muted); } .act.undo svg { width: 20px; height: 20px; }
  .act.no { color: var(--danger); } .act.no:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 12%, var(--bg-secondary)); }
  .act.yes { color: var(--success); } .act.yes:hover:not(:disabled) { background: color-mix(in srgb, var(--success) 12%, var(--bg-secondary)); }
  .act.heart { width: 50px; height: 50px; color: var(--accent-ink); } .act.heart svg { fill: currentColor; stroke-width: 1.5; }
  .act.heart:hover:not(:disabled) { background: var(--accent-dim); }
  .act.yes svg { fill: currentColor; }
  .keys { margin: -4px 0 0; font-size: 12px; color: var(--text-subtle); }
  @media (hover: none) { .keys { display: none; } }
  .err { color: var(--danger); font-size: 13.5px; margin: 0; }

  .done { padding: 34px 22px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; border: 1px dashed var(--border);
    border-radius: 20px; background: var(--glass); }
  .done h3 { margin: 6px 0 0; font-size: 20px; } .done p { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.5; max-width: 32ch; }
  .ring { width: 46px; height: 46px; border-radius: 50%; border: 5px solid var(--accent); transform: rotate(-8deg) scaleX(1.1); }
  .primary, .ghost { height: 42px; padding: 0 18px; border-radius: 12px; font: inherit; font-weight: 700; font-size: 14px; cursor: pointer; }
  .primary { border: 0; background: var(--accent); color: var(--on-accent); }
  .ghost { border: 1px solid var(--border); background: transparent; color: var(--text-primary); }

  /* C'est un match ! */
  .match { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 20px;
    background: color-mix(in srgb, var(--graphite-950) 78%, transparent); animation: mFade .25s ease-out both; }
  @keyframes mFade { from { opacity: 0; } }
  .m-in { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; color: var(--paper); animation: mPop .5s cubic-bezier(.2,1.4,.4,1) both; }
  @keyframes mPop { from { opacity: 0; transform: scale(.7); } }
  .m-photo { position: relative; width: 168px; height: 168px; border-radius: 50%; background: var(--graphite-700) center 25% / cover; display: grid; place-items: center; margin-bottom: 8px; }
  .m-ring { position: absolute; inset: -22px; width: calc(100% + 44px); height: calc(100% + 44px); overflow: visible; transform: rotate(-8deg); }
  .m-ring path { fill: none; stroke: var(--crayon-400); stroke-width: 9; stroke-linecap: round; stroke-dasharray: 100; stroke-dashoffset: 100; animation: draw .7s cubic-bezier(.6,.05,.25,1) .2s forwards;
    filter: drop-shadow(0 0 12px color-mix(in srgb, var(--crayon-400) 60%, transparent)); }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  .m-in h2 { margin: 0; font-size: 38px; font-stretch: 82%; color: var(--crayon-400); }
  .m-in p { margin: 0; font-size: 15px; color: var(--graphite-200); }
  .m-act { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; justify-content: center; }
  .match .ghost { color: var(--paper); border-color: color-mix(in srgb, var(--paper) 30%, transparent); }
  .burst { position: absolute; left: 50%; top: 42%; width: 0; height: 0; pointer-events: none; }
  .burst i { position: absolute; width: 9px; height: 9px; border-radius: 2px; background: var(--crayon-400); opacity: 0;
    animation: conf 1s cubic-bezier(.15,.7,.3,1) .15s forwards; }
  .burst i.alt { background: var(--paper); border-radius: 50%; width: 6px; height: 6px; }
  @keyframes conf { 0% { opacity: 1; transform: rotate(var(--a)) translateY(0); } 100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--r) * -1)) rotate(220deg); } }
  @media (prefers-reduced-motion: reduce) { .card, .card.top, .m-in, .burst i, .m-ring path { animation: none !important; transition: none !important; } .m-ring path { stroke-dashoffset: 0; } }
  `]
})
export class RoomSwipeComponent {
  private readonly api = inject(RoomService);
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly roomId = input.required<string>();
  readonly roles = input<RoomRole[]>([]);
  readonly startRole = input<string | null>(null);
  readonly voted = output<void>();
  readonly showResults = output<string>();

  readonly roleId = signal<string | null>(null);
  readonly role = computed(() => this.roles().find(r => r.id === this.roleId()) ?? null);
  readonly cards = signal<SwipeCard[]>([]);
  readonly visible = computed(() => this.cards().slice(0, 3));
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly last = signal<SwipeCard | null>(null);
  readonly match = signal<SwipeCard | null>(null);
  readonly flying = signal(false);
  readonly dx = signal(0); readonly dy = signal(0);
  readonly cardTransform = computed(() => `translate(${this.dx()}px, ${this.dy()}px) rotate(${this.dx() / 14}deg)`);
  readonly hint = computed<Vote | null>(() => this.dy() < -70 && Math.abs(this.dy()) > Math.abs(this.dx()) ? 'COEUR' : this.dx() > 30 ? 'OUI' : this.dx() < -30 ? 'NON' : null);
  readonly hintStrength = computed(() => Math.min(1, Math.max(Math.abs(this.dx()), Math.abs(this.dy())) / 110));
  readonly confetti = Array.from({ length: 22 }, (_, i) => ({ a: `${i * 16.4}deg`, r: `${110 + (i * 37) % 90}px`, alt: i % 3 === 0 }));
  private start: { x: number; y: number; id: number } | null = null;

  constructor() {
    // Rôle de départ : celui demandé, sinon le premier qui a des cartes à swiper.
    effect(() => {
      const rs = this.roles();
      if (!rs.length || untracked(this.roleId)) return;
      const first = this.startRole() ?? rs.find(r => r.toSwipe)?.id ?? rs[0].id;
      untracked(() => this.pick(first));
    });
  }

  pick(id: string): void {
    this.roleId.set(id); this.last.set(null); this.error.set('');
    this.loading.set(true);
    this.api.deck(this.roomId(), id).subscribe({
      next: c => { this.cards.set(c); this.loading.set(false); this.bringIntoView(); },
      error: e => { this.loading.set(false); this.cards.set([]); this.error.set(e.error?.message ?? 'Cartes indisponibles.'); }
    });
  }

  down(e: PointerEvent): void {
    if (this.busy()) return;
    this.start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  @HostListener('pointermove', ['$event']) move(e: PointerEvent): void {
    if (!this.start || e.pointerId !== this.start.id) return;
    this.dx.set(e.clientX - this.start.x); this.dy.set(Math.min(40, e.clientY - this.start.y));
  }
  @HostListener('pointerup', ['$event']) @HostListener('pointercancel', ['$event']) up(e: PointerEvent): void {
    if (!this.start || e.pointerId !== this.start.id) return;
    this.start = null;
    const v = this.hint();
    if (v && this.hintStrength() >= 1) this.vote(v);
    else { this.dx.set(0); this.dy.set(0); }
  }
  @HostListener('document:keydown', ['$event']) key(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (this.match() || !this.cards().length || /INPUT|TEXTAREA|SELECT/.test(t.tagName) || !this.host.nativeElement.isConnected) return;
    const map: Record<string, Vote> = { ArrowLeft: 'NON', ArrowRight: 'OUI', ArrowUp: 'COEUR' };
    if (map[e.key]) { e.preventDefault(); this.vote(map[e.key]); }
    else if (e.key === 'Backspace' && this.last()) { e.preventDefault(); this.undo(); }
  }

  vote(v: Vote): void {
    const c = this.cards()[0]; if (!c || this.busy()) return;
    this.busy.set(true);
    // La carte s'envole du bon côté, puis la suivante arrive.
    this.dx.set(v === 'OUI' ? 520 : v === 'NON' ? -520 : 0); this.dy.set(v === 'COEUR' ? -620 : this.dy());
    this.flying.set(true);
    navigator.vibrate?.(v === 'COEUR' ? [10, 40, 10] : 10);
    this.api.vote(this.roomId(), c.entryId, v).subscribe({
      next: r => {
        setTimeout(() => {
          this.cards.update(list => list.slice(1)); this.last.set(c);
          this.flying.set(false); this.dx.set(0); this.dy.set(0); this.busy.set(false);
          if (r.newMatch) this.match.set(c);
          this.voted.emit();
        }, 260);
      },
      error: e => { this.flying.set(false); this.dx.set(0); this.dy.set(0); this.busy.set(false); this.error.set(e.error?.message ?? 'Vote impossible.'); }
    });
  }

  undo(): void {
    const c = this.last(); if (!c || this.busy()) return;
    this.busy.set(true);
    this.api.unvote(this.roomId(), c.entryId).subscribe({
      next: () => { this.cards.update(list => [c, ...list]); this.last.set(null); this.busy.set(false); this.voted.emit(); },
      error: () => { this.busy.set(false); this.error.set('Impossible d’annuler ce vote.'); }
    });
  }

  /** Téléphone : la page défile jusqu'aux cartes, pour que la carte et ses boutons soient entiers à l'écran. */
  private bringIntoView(): void {
    if (!matchMedia('(max-width: 760px)').matches) return;
    setTimeout(() => {
      const el = this.host.nativeElement as HTMLElement, sc = el.closest('.content') as HTMLElement | null;
      if (!sc) return;
      const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 64;
      sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }, 60);
  }
  meta(c: SwipeCard): string { return [c.age ? c.age + ' ans' : '', c.city, c.height ? c.height + ' cm' : ''].filter(Boolean).join(' · '); }
  initials(n: string): string { return n.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
}
