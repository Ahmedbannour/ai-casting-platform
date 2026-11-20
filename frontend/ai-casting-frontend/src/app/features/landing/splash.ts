import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, inject, output } from '@angular/core';

/**
 * Écran d'accueil animé de la vitrine (à chaque arrivée sur la page d'accueil).
 * Mise en scène de la marque : une planche de visages apparaît, le crayon entoure l'un d'eux (le geste du casting),
 * ce cercle devient le C de « Cercle » et le nom se déroule, puis une ouverture à l'iris depuis le C dévoile la vitrine.
 * Pur CSS + Web Animations (aucune bibliothèque) ; un clic, Échap, Entrée ou Espace le passe.
 */
@Component({
  selector: 'app-splash',
  standalone: true,
  template: `
  <div class="splash" role="status" aria-label="Ouverture de Cercle" (click)="skip()">
    <svg class="grain" aria-hidden="true"><filter id="sp-grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0"/></filter><rect width="100%" height="100%" filter="url(#sp-grain)"/></svg>
    <div class="glow" aria-hidden="true"></div>

    <!-- 1. La planche de visages ; le crayon entoure celui du centre -->
    <div class="sheet" aria-hidden="true">
      @for (f of faces; track $index) {
        <div class="face" [class.pick]="$index === 7" [style.--i]="f.d" [style.--t]="f.t"><i></i></div>
      }
    </div>

    <!-- 2. Le cercle tracé devient le C de « Cercle », le reste du nom se déroule -->
    <div class="brand" aria-hidden="true">
      <span class="mark">
        <svg viewBox="0 0 100 100"><path pathLength="100" d="M80 25 C 68 12, 42 9, 25 22 C 8 36, 7 64, 23 79 C 39 94, 68 92, 82 74"/></svg>
      </span>
      <span class="rest">@for (c of letters; track $index) { <span class="l" [style.--i]="$index">{{ c }}</span> }</span>
    </div>
    <p class="tag" aria-hidden="true">Toute l’équipe du casting, dans un seul cercle.</p>

    <button type="button" class="skip" (click)="skip(); $event.stopPropagation()">Passer</button>
  </div>
  `,
  styles: [`
  @property --iris { syntax: '<length>'; inherits: false; initial-value: 0px; }
  :host { position: fixed; inset: 0; z-index: 1000; display: block; --mk: clamp(54px, 13vw, 92px); }
  .splash {
    position: absolute; inset: 0; overflow: hidden; cursor: pointer;
    background: radial-gradient(120% 90% at 50% 42%, var(--graphite-850) 0%, var(--graphite-950) 70%);
    color: var(--paper); display: grid; place-items: center; align-content: center; gap: 22px;
    -webkit-mask: radial-gradient(circle at var(--ox, 50%) var(--oy, 46%), transparent var(--iris), #000 calc(var(--iris) + 1px));
            mask: radial-gradient(circle at var(--ox, 50%) var(--oy, 46%), transparent var(--iris), #000 calc(var(--iris) + 1px));
  }
  .splash.out { animation: iris .9s cubic-bezier(.7,0,.2,1) forwards; }
  @keyframes iris { to { --iris: 150vmax; } }
  .grain { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; mix-blend-mode: overlay; }
  .glow { position: absolute; width: 80vmax; height: 80vmax; left: 50%; top: 46%; translate: -50% -50%; border-radius: 50%; pointer-events: none;
    background: radial-gradient(circle, color-mix(in srgb, var(--crayon-400) 18%, transparent), transparent 60%);
    opacity: 0; animation: glow 1.4s ease-out .6s forwards; }
  @keyframes glow { to { opacity: 1; } }

  /* Planche : 5 × 3 visages, le 8e (centre) est choisi */
  .sheet { position: absolute; left: 50%; top: 46%; translate: -50% -50%; display: grid; grid-template-columns: repeat(5, calc(var(--mk) * 1.15)); gap: calc(var(--mk) * .18);
    animation: sheetOut .5s cubic-bezier(.5,0,.75,0) 1.5s forwards; }
  @keyframes sheetOut { to { opacity: 0; transform: scale(1.08); filter: blur(4px); } }
  .face { aspect-ratio: 3 / 4; border-radius: 10px; position: relative; overflow: hidden;
    background: color-mix(in srgb, var(--graphite-700) calc(60% + var(--t) * 1%), var(--graphite-800));
    border: 1px solid var(--graphite-700); opacity: 0;
    animation: faceIn .5s cubic-bezier(.2,.9,.3,1.2) calc(var(--i) * 28ms) forwards, dim .4s ease-out .95s forwards; }
  .face i { position: absolute; inset: 0;
    background: radial-gradient(circle at 50% 38%, var(--graphite-500) 0 17%, transparent 18%), radial-gradient(ellipse at 50% 102%, var(--graphite-500) 0 44%, transparent 45%); }
  @keyframes faceIn { from { opacity: 0; transform: translateY(14px) scale(.9); } to { opacity: .9; transform: none; } }
  @keyframes dim { to { opacity: .28; } }
  .face.pick { animation: faceIn .5s cubic-bezier(.2,.9,.3,1.2) calc(var(--i) * 28ms) forwards, picked .4s ease-out .95s forwards; }
  .face.pick i { background: radial-gradient(circle at 50% 38%, var(--crayon-300) 0 17%, transparent 18%), radial-gradient(ellipse at 50% 102%, var(--crayon-300) 0 44%, transparent 45%); }
  @keyframes picked { to { opacity: 1; border-color: var(--crayon-400); box-shadow: 0 0 34px color-mix(in srgb, var(--crayon-400) 45%, transparent); } }

  /* Marque : le cercle est d'abord grand autour du visage choisi, puis rétrécit et devient le C */
  .brand { position: absolute; z-index: 1; left: 50%; top: 46%; translate: -50% -50%; display: flex; align-items: center; }
  .mark { flex: none; width: var(--mk); height: var(--mk); display: block; transform: scale(2.35) rotate(-6deg);
    animation: toLetter .7s cubic-bezier(.65,0,.2,1) 1.55s forwards; }
  @keyframes toLetter { to { transform: none; } }
  .mark svg { width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 0 14px color-mix(in srgb, var(--crayon-400) 55%, transparent)); }
  .mark path { fill: none; stroke: var(--crayon-400); stroke-width: 12; stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 100; stroke-dashoffset: 100; opacity: 0; animation: draw .75s cubic-bezier(.6,.05,.25,1) .5s forwards; }
  @keyframes draw { 0% { opacity: 1; } to { opacity: 1; stroke-dashoffset: 0; } }
  /* Le reste du nom part d'une largeur nulle : le C se décale tout seul vers la gauche */
  .rest { display: inline-flex; overflow: hidden; max-width: 0; padding-bottom: 4px;
    font: 800 calc(var(--mk) * 1.12)/1 var(--font, 'Archivo', sans-serif); font-stretch: 82%; letter-spacing: -.015em; margin-left: calc(var(--mk) * -.08);
    animation: unroll .75s cubic-bezier(.65,0,.2,1) 1.6s forwards; }
  @keyframes unroll { to { max-width: 6em; } }
  .l { display: inline-block; transform: translateY(105%); animation: up .55s cubic-bezier(.2,.9,.2,1) forwards; animation-delay: calc(1.75s + var(--i) * 50ms); }
  @keyframes up { to { transform: none; } }

  .tag { position: absolute; z-index: 1; left: 0; right: 0; top: calc(46% + var(--mk) * .75); margin: 0; font: 500 clamp(14px, 2.2vw, 17px)/1.4 var(--font, sans-serif); color: var(--graphite-300);
    opacity: 0; animation: tag .6s ease-out 2.15s forwards; text-align: center; padding: 0 24px; }
  @keyframes tag { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

  .skip { position: absolute; right: max(20px, env(safe-area-inset-right)); bottom: max(20px, env(safe-area-inset-bottom)); height: 36px; padding: 0 14px;
    border-radius: 999px; border: 1px solid var(--graphite-700); background: color-mix(in srgb, var(--graphite-900) 60%, transparent); color: var(--graphite-300);
    font: 600 13px var(--font, sans-serif); cursor: pointer; opacity: 0; animation: tag .4s ease-out .6s forwards; }
  .skip:hover, .skip:focus-visible { color: var(--paper); border-color: var(--crayon-400); outline: none; }
  .splash.out .skip { display: none; }

  @media (max-width: 520px) { .sheet { grid-template-columns: repeat(5, calc(var(--mk) * .92)); gap: calc(var(--mk) * .12); } }
  /* Moins d'animations demandées : l'état final, puis l'ouverture. */
  @media (prefers-reduced-motion: reduce) {
    .sheet { display: none; }
    .mark, .mark path, .rest, .l, .tag, .glow, .skip { animation-duration: 1ms !important; animation-delay: 0s !important; }
  }
  `]
})
export class SplashComponent implements AfterViewInit, OnDestroy {
  readonly done = output<void>();
  readonly letters = [...'ercle'];
  /** Visages de la planche : ordre d'apparition depuis le centre, teinte légèrement variée. */
  readonly faces = Array.from({ length: 15 }, (_, i) => {
    const x = i % 5, y = Math.floor(i / 5);
    return { d: Math.abs(x - 2) + Math.abs(y - 1), t: (i * 37) % 25 };
  });
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private timers: ReturnType<typeof setTimeout>[] = [];
  private finished = false;
  private readonly onKey = (e: KeyboardEvent) => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); this.skip(); } };

  ngAfterViewInit(): void {
    document.addEventListener('keydown', this.onKey);
    this.zone.runOutsideAngular(() => this.timers.push(setTimeout(() => this.zone.run(() => this.open()),
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 900 : 2900)));
  }

  ngOnDestroy(): void { this.timers.forEach(clearTimeout); document.removeEventListener('keydown', this.onKey); }

  skip(): void { this.open(true); }

  /** Ouverture à l'iris depuis le cercle du logo, puis fin. */
  private open(fast = false): void {
    if (this.finished) return;
    this.finished = true;
    const el = (this.host.nativeElement as HTMLElement).querySelector('.splash') as HTMLElement;
    const loop = el.querySelector('.mark') as HTMLElement | null;
    if (loop) {
      const r = loop.getBoundingClientRect();
      el.style.setProperty('--ox', `${r.left + r.width / 2}px`);
      el.style.setProperty('--oy', `${r.top + r.height / 2}px`);
    }
    const supportsIris = typeof CSS !== 'undefined' && 'registerProperty' in CSS;
    if (supportsIris) {
      if (fast) el.style.animationDuration = '.55s';
      el.classList.add('out');
    } else {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fast ? 250 : 500, fill: 'forwards' });
    }
    this.timers.push(setTimeout(() => this.done.emit(), fast ? 300 : 420));   // la vitrine démarre pendant l'ouverture
    this.timers.push(setTimeout(() => (this.host.nativeElement as HTMLElement).style.display = 'none', fast ? 600 : 950));
  }
}
