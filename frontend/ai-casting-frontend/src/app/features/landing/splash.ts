import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, inject, output } from '@angular/core';

/**
 * Écran d'accueil animé de la vitrine (à chaque arrivée sur la page d'accueil).
 * Mise en scène « cinéma » : le cercle du logo se dessine au crayon, la planche contact s'ouvre en éventail,
 * le nom se révèle, le clap se referme, puis une ouverture à l'iris dévoile la vitrine.
 * Pur CSS + Web Animations (aucune bibliothèque) ; un clic, Échap, Entrée ou Espace le passe.
 */
@Component({
  selector: 'app-splash',
  standalone: true,
  template: `
  <div class="splash" role="status" aria-label="Ouverture de Cercle" (click)="skip()">
    <svg class="grain" aria-hidden="true"><filter id="sp-grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0"/></filter><rect width="100%" height="100%" filter="url(#sp-grain)"/></svg>
    <div class="beam" aria-hidden="true"></div>
    <div class="bokeh" aria-hidden="true">@for (b of bokeh; track $index) { <i [style.--x]="b.x" [style.--y]="b.y" [style.--s]="b.s" [style.--d]="b.d" [class.cool]="b.cool"></i> }</div>

    <div class="stage" aria-hidden="true">
      <div class="fan">
        <div class="frame f1"><div class="fl"><i></i><span>N° 3</span></div></div>
        <div class="frame f2"><div class="fl"><i></i><span>N° 2</span></div></div>
        <div class="frame f3"><div class="fl"><i></i><span>N° 1</span></div></div>
      </div>

      <span class="ripple"></span>
      <svg class="loop" viewBox="0 0 200 200">
        <path d="M100 26 C 146 24, 176 58, 174 102 C 172 146, 136 176, 96 174 C 54 172, 24 138, 28 96 C 32 58, 62 30, 104 30 C 118 31, 128 35, 134 40"/>
      </svg>

      <div class="slate">
        <div class="clap"><b></b><b></b><b></b><b></b><b></b><b></b></div>
        <div class="slate-body"><span>Scène 01</span><span>Prise 1</span><span class="action">Action !</span></div>
        <div class="burst">@for (c of confetti; track $index) { <i [style.--a]="c.a" [style.--r]="c.r" [class.cool]="c.cool"></i> }</div>
      </div>
    </div>

    <div class="name" aria-hidden="true">
      <h1 class="word wordmark">@for (c of letters; track $index) { <span class="l" [class.c1]="$index === 0" [style.--i]="$index">{{ c }}</span> }</h1>
      <svg class="under" viewBox="0 0 300 20" preserveAspectRatio="none"><path pathLength="100" d="M6 13 C 70 6, 150 5, 214 9 S 282 12, 294 8"/></svg>
    </div>
    <p class="tag" aria-hidden="true">L’intention du réalisateur. Les bons acteurs.</p>

    <div class="progress" aria-hidden="true"><b></b></div>
    <button type="button" class="skip" (click)="skip(); $event.stopPropagation()">Passer</button>
  </div>
  `,
  styles: [`
  @property --iris { syntax: '<length>'; inherits: false; initial-value: 0px; }
  :host { position: fixed; inset: 0; z-index: 1000; display: block; }
  .splash {
    position: absolute; inset: 0; overflow: hidden; cursor: pointer;
    background: radial-gradient(120% 90% at 50% 40%, var(--graphite-850) 0%, var(--graphite-950) 62%, #0d0e10 100%);
    color: var(--paper); display: grid; place-items: center; align-content: center; gap: 18px;
    -webkit-mask: radial-gradient(circle at var(--ox, 50%) var(--oy, 42%), transparent var(--iris), #000 calc(var(--iris) + 1px));
            mask: radial-gradient(circle at var(--ox, 50%) var(--oy, 42%), transparent var(--iris), #000 calc(var(--iris) + 1px));
  }
  .splash.out { animation: iris .9s cubic-bezier(.7,0,.2,1) forwards; }
  @keyframes iris { to { --iris: 150vmax; } }
  .grain { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; mix-blend-mode: overlay; }
  .beam { position: absolute; width: 70vmax; height: 70vmax; left: 50%; top: 42%; translate: -50% -50%; border-radius: 50%;
    background: radial-gradient(circle, rgba(242,194,48,.16), rgba(242,194,48,0) 62%); animation: beam 2.8s ease-in-out both; }
  @keyframes beam { from { opacity: 0; transform: translateX(-30%) scale(.6); } 60% { opacity: 1; } to { opacity: .9; transform: none; } }

  .stage { position: relative; width: min(260px, 56vw); aspect-ratio: 1; }
  .loop { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; transform: rotate(-8deg) scaleX(1.08); filter: drop-shadow(0 0 18px rgba(242,194,48,.35)); }
  .loop path { fill: none; stroke: var(--crayon-400); stroke-width: 15; stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 560; stroke-dashoffset: 560; animation: draw 1.05s cubic-bezier(.6,.05,.25,1) .15s forwards; }
  @keyframes draw { to { stroke-dashoffset: 0; } }

  .fan { position: absolute; inset: 14%; }
  .frame { position: absolute; inset: 0; border-radius: 16px; background: linear-gradient(160deg, color-mix(in srgb, var(--graphite-600) 60%, var(--graphite-800)), var(--graphite-850)); border: 1px solid color-mix(in srgb, var(--paper) 14%, transparent);
    box-shadow: 0 20px 40px rgba(0,0,0,.45); overflow: hidden; opacity: 0; transform-origin: 50% 120%; }
  .fl { position: absolute; inset: 0; animation: float 3.2s ease-in-out 1.3s infinite alternate; }
  .f2 .fl { animation-delay: 1.6s; } .f3 .fl { animation-delay: 1.45s; animation-duration: 3.6s; }
  @keyframes float { to { transform: translateY(-5px) rotate(.6deg); } }
  .frame i { position: absolute; inset: 9% 9% 25%; border-radius: 10px;
    background: radial-gradient(circle at 50% 38%, var(--tone) 0 18%, transparent 19%), radial-gradient(ellipse at 50% 100%, var(--tone) 0 42%, transparent 43%),
      linear-gradient(170deg, var(--sky), var(--graphite-850)); }
  .f1 { --tone: color-mix(in srgb, var(--rouge-300) 70%, var(--graphite-600)); --sky: color-mix(in srgb, var(--rouge-400) 30%, var(--graphite-700)); }
  .f2 { --tone: color-mix(in srgb, var(--bleu-300) 70%, var(--graphite-600)); --sky: color-mix(in srgb, var(--bleu-400) 32%, var(--graphite-700)); }
  .f3 { --tone: var(--crayon-300); --sky: color-mix(in srgb, var(--crayon-400) 34%, var(--graphite-700)); }
  .frame span { position: absolute; left: 10%; bottom: 9%; font: 700 11px/1 var(--font, sans-serif); color: var(--crayon-400); letter-spacing: .04em; }
  .frame::before, .frame::after { content: ''; position: absolute; left: 0; right: 0; height: 7px;
    background: repeating-linear-gradient(90deg, transparent 0 6px, rgba(255,255,255,.18) 6px 10px); }
  .frame::before { top: 3px; } .frame::after { bottom: 3px; }
  .f1 { animation: fan1 .7s cubic-bezier(.2,.9,.25,1.25) .55s forwards; }
  .f2 { animation: fan2 .7s cubic-bezier(.2,.9,.25,1.25) .65s forwards; }
  .f3 { animation: fan3 .7s cubic-bezier(.2,.9,.25,1.25) .75s forwards; }
  @keyframes fan1 { from { opacity: 0; transform: translateY(30px) scale(.7); } to { opacity: .55; transform: rotate(-16deg) translateX(-26%) scale(.82); } }
  @keyframes fan2 { from { opacity: 0; transform: translateY(30px) scale(.7); } to { opacity: .75; transform: rotate(14deg) translateX(26%) scale(.82); } }
  @keyframes fan3 { from { opacity: 0; transform: translateY(30px) scale(.7); } to { opacity: 1; transform: scale(.86); } }

  /* Lumières flottantes (bokeh) */
  .bokeh { position: absolute; inset: 0; pointer-events: none; }
  .bokeh i { position: absolute; left: var(--x); top: var(--y); width: var(--s); height: var(--s); border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--crayon-400) 38%, transparent), transparent 70%); filter: blur(2px);
    opacity: 0; animation: bk 6s ease-in-out calc(var(--d) * 1s) infinite; }
  .bokeh i.cool { background: radial-gradient(circle, color-mix(in srgb, var(--bleu-400) 32%, transparent), transparent 70%); }
  @keyframes bk { 0% { opacity: 0; transform: translateY(20px) scale(.8); } 40% { opacity: .9; } 100% { opacity: 0; transform: translateY(-60px) scale(1.15); } }

  /* Onde qui part du cercle une fois tracé */
  .ripple { position: absolute; inset: 6%; border-radius: 50%; border: 2px solid var(--crayon-400); opacity: 0; transform: scale(.9);
    animation: ripple 1s cubic-bezier(.2,.7,.3,1) 1.15s forwards; }
  @keyframes ripple { 0% { opacity: .8; transform: scale(.9); } 100% { opacity: 0; transform: scale(1.45); } }

  /* Éclat de confettis quand le clap se referme */
  .burst { position: absolute; left: 50%; top: 0; width: 0; height: 0; }
  .burst i { position: absolute; width: 7px; height: 7px; border-radius: 2px; background: var(--crayon-400); opacity: 0;
    animation: conf .8s cubic-bezier(.15,.7,.3,1) 2.24s forwards; }
  .burst i.cool { background: var(--paper); border-radius: 50%; width: 5px; height: 5px; }
  @keyframes conf { 0% { opacity: 1; transform: rotate(var(--a)) translateY(0) scale(1); }
    100% { opacity: 0; transform: rotate(var(--a)) translateY(calc(var(--r) * -1)) rotate(200deg) scale(.6); } }

  .slate { position: absolute; left: 50%; bottom: -30%; width: 74%; translate: -50% 0; opacity: 0; animation: slateIn .45s ease-out 1.35s forwards; }
  @keyframes slateIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  .clap { display: flex; height: 16px; border-radius: 3px 3px 0 0; overflow: hidden; transform-origin: 0 100%;
    transform: rotate(-24deg); animation: clap .22s cubic-bezier(.6,0,.9,.6) 2.05s forwards; }
  .clap b { flex: 1; background: var(--paper); transform: skewX(-30deg); } .clap b:nth-child(even) { background: #17181c; }
  @keyframes clap { to { transform: rotate(0); } }
  .stage { animation: thud .3s ease-out 2.25s; }
  @keyframes thud { 30% { transform: translateY(3px) scale(.995); } }
  .slate-body { display: flex; justify-content: space-between; gap: 8px; padding: 7px 10px; background: #1c1d22; border: 1px solid #3a3b44; border-top: none;
    font: 600 11px/1 var(--font, sans-serif); color: #a9aab3; letter-spacing: .04em; }
  .action { color: var(--crayon-400); opacity: 0; animation: act .2s ease-out 2.2s forwards; }
  @keyframes act { to { opacity: 1; } }

  .name { position: relative; margin-top: 74px; display: flex; flex-direction: column; align-items: center; }
  .under { width: 92%; height: 14px; margin-top: -2px; overflow: visible; }
  .under path { fill: none; stroke: var(--crayon-400); stroke-width: 5; stroke-linecap: round; stroke-dasharray: 100; stroke-dashoffset: 100; opacity: 0;
    animation: under .55s cubic-bezier(.6,.05,.25,1) 1.55s forwards; }
  @keyframes under { 0% { opacity: 1; } to { opacity: 1; stroke-dashoffset: 0; } }
  .l.c1 { color: var(--crayon-400); }
  .progress { position: absolute; left: 50%; bottom: max(28px, env(safe-area-inset-bottom)); translate: -50% 0; width: min(180px, 40vw); height: 3px; border-radius: 3px;
    background: color-mix(in srgb, var(--paper) 12%, transparent); overflow: hidden; }
  .progress b { display: block; height: 100%; background: var(--crayon-400); border-radius: 3px; transform-origin: 0 50%; transform: scaleX(0);
    animation: prog 2.9s linear forwards; }
  @keyframes prog { to { transform: scaleX(1); } }
  .splash.out .progress { display: none; }
  .word { margin: 0; font: 800 clamp(40px, 8vw, 84px)/1 var(--font, 'Archivo', sans-serif); font-stretch: 82%; letter-spacing: -.01em; display: flex; overflow: hidden; padding: 0 4px 6px; }
  .l { display: inline-block; white-space: pre; transform: translateY(110%) rotate(8deg); filter: blur(6px); animation: up .65s cubic-bezier(.2,1.3,.3,1) forwards; animation-delay: calc(1.05s + var(--i) * 55ms); }
  @keyframes up { to { transform: none; filter: none; } }
  .tag { margin: 0; font: 500 clamp(14px, 2.2vw, 17px)/1.4 var(--font, sans-serif); color: #a9aab3; opacity: 0; animation: tag .6s ease-out 1.6s forwards; text-align: center; padding: 0 20px; }
  @keyframes tag { from { opacity: 0; letter-spacing: .12em; } to { opacity: 1; letter-spacing: .01em; } }

  .skip { position: absolute; right: max(20px, env(safe-area-inset-right)); bottom: max(20px, env(safe-area-inset-bottom)); height: 36px; padding: 0 14px;
    border-radius: 999px; border: 1px solid #3a3b44; background: rgba(23,24,28,.6); color: #a9aab3; font: 600 13px var(--font, sans-serif); cursor: pointer;
    opacity: 0; animation: tag .4s ease-out .6s forwards; }
  .skip:hover, .skip:focus-visible { color: var(--paper); border-color: var(--crayon-400); outline: none; }
  .splash.out .skip { display: none; }
  @media (prefers-reduced-motion: reduce) { .bokeh, .burst, .ripple { display: none; } .fl, .stage { animation: none !important; } }
  `]
})
export class SplashComponent implements AfterViewInit, OnDestroy {
  readonly done = output<void>();
  readonly letters = [...'Cercle'];
  /** Lumières flottantes du fond (positions fixes, apparitions décalées). */
  readonly bokeh = [
    { x: '12%', y: '22%', s: '90px', d: 0, cool: false }, { x: '78%', y: '18%', s: '60px', d: 1.2, cool: true },
    { x: '84%', y: '64%', s: '110px', d: .5, cool: false }, { x: '8%', y: '70%', s: '70px', d: 2, cool: true },
    { x: '55%', y: '84%', s: '50px', d: 1.6, cool: false }, { x: '30%', y: '8%', s: '40px', d: 2.6, cool: false }];
  /** Confettis du clap : 14 éclats en éventail vers le haut. */
  readonly confetti = Array.from({ length: 14 }, (_, i) => ({ a: `${-80 + i * 12.3}deg`, r: `${70 + (i * 29) % 60}px`, cool: i % 3 === 0 }));
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private timers: ReturnType<typeof setTimeout>[] = [];
  private finished = false;
  private readonly onKey = (e: KeyboardEvent) => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); this.skip(); } };

  ngAfterViewInit(): void {
    document.addEventListener('keydown', this.onKey);
    this.zone.runOutsideAngular(() => this.timers.push(setTimeout(() => this.zone.run(() => this.open()), 2900)));
  }

  ngOnDestroy(): void { this.timers.forEach(clearTimeout); document.removeEventListener('keydown', this.onKey); }

  skip(): void { this.open(true); }

  /** Ouverture à l'iris depuis le cercle du logo, puis fin. */
  private open(fast = false): void {
    if (this.finished) return;
    this.finished = true;
    const el = (this.host.nativeElement as HTMLElement).querySelector('.splash') as HTMLElement;
    const loop = el.querySelector('.loop') as HTMLElement | null;
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
