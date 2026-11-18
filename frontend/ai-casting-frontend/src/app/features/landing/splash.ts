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
  <div class="splash" role="status" aria-label="Ouverture d'AI Casting" (click)="skip()">
    <svg class="grain" aria-hidden="true"><filter id="sp-grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0"/></filter><rect width="100%" height="100%" filter="url(#sp-grain)"/></svg>
    <div class="beam" aria-hidden="true"></div>

    <div class="stage" aria-hidden="true">
      <div class="fan">
        <div class="frame f1"><i></i><span>N° 3</span></div>
        <div class="frame f2"><i></i><span>N° 2</span></div>
        <div class="frame f3"><i></i><span>N° 1</span></div>
      </div>

      <svg class="loop" viewBox="0 0 200 200">
        <path d="M100 26 C 146 24, 176 58, 174 102 C 172 146, 136 176, 96 174 C 54 172, 24 138, 28 96 C 32 58, 62 30, 104 30 C 118 31, 128 35, 134 40"/>
      </svg>

      <div class="slate">
        <div class="clap"><b></b><b></b><b></b><b></b><b></b><b></b></div>
        <div class="slate-body"><span>Scène 01</span><span>Prise 1</span><span class="action">Action !</span></div>
      </div>
    </div>

    <h1 class="word" aria-hidden="true">
      @for (c of letters; track $index) { <span class="l" [style.--i]="$index">{{ c }}</span> }
    </h1>
    <p class="tag" aria-hidden="true">Décrivez le rôle. Nous préparons la planche.</p>

    <button type="button" class="skip" (click)="skip(); $event.stopPropagation()">Passer</button>
  </div>
  `,
  styles: [`
  @property --iris { syntax: '<length>'; inherits: false; initial-value: 0px; }
  :host { position: fixed; inset: 0; z-index: 1000; display: block; }
  .splash {
    position: absolute; inset: 0; overflow: hidden; cursor: pointer;
    background: radial-gradient(120% 90% at 50% 40%, #202128 0%, #15161a 55%, #0f1013 100%);
    color: #f3f1ea; display: grid; place-items: center; align-content: center; gap: 18px;
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
  .loop path { fill: none; stroke: #F2C230; stroke-width: 15; stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 560; stroke-dashoffset: 560; animation: draw 1.05s cubic-bezier(.6,.05,.25,1) .15s forwards; }
  @keyframes draw { to { stroke-dashoffset: 0; } }

  .fan { position: absolute; inset: 14%; }
  .frame { position: absolute; inset: 0; border-radius: 10px; background: #26272e; border: 1px solid #3a3b44;
    box-shadow: 0 20px 40px rgba(0,0,0,.45); overflow: hidden; opacity: 0; transform-origin: 50% 120%; }
  .frame i { position: absolute; inset: 10% 10% 26%; border-radius: 6px;
    background: radial-gradient(circle at 50% 38%, #4a4b55 0 18%, transparent 19%), radial-gradient(ellipse at 50% 100%, #4a4b55 0 42%, transparent 43%), #33343c; }
  .frame span { position: absolute; left: 10%; bottom: 8%; font: 700 11px/1 var(--font, sans-serif); color: #F2C230; letter-spacing: .04em; }
  .frame::before, .frame::after { content: ''; position: absolute; left: 0; right: 0; height: 7px;
    background: repeating-linear-gradient(90deg, transparent 0 6px, rgba(255,255,255,.18) 6px 10px); }
  .frame::before { top: 3px; } .frame::after { bottom: 3px; }
  .f1 { animation: fan1 .7s cubic-bezier(.2,.9,.25,1.25) .55s forwards; }
  .f2 { animation: fan2 .7s cubic-bezier(.2,.9,.25,1.25) .65s forwards; }
  .f3 { animation: fan3 .7s cubic-bezier(.2,.9,.25,1.25) .75s forwards; }
  @keyframes fan1 { from { opacity: 0; transform: translateY(30px) scale(.7); } to { opacity: .55; transform: rotate(-16deg) translateX(-26%) scale(.82); } }
  @keyframes fan2 { from { opacity: 0; transform: translateY(30px) scale(.7); } to { opacity: .75; transform: rotate(14deg) translateX(26%) scale(.82); } }
  @keyframes fan3 { from { opacity: 0; transform: translateY(30px) scale(.7); } to { opacity: 1; transform: scale(.86); } }

  .slate { position: absolute; left: 50%; bottom: -30%; width: 74%; translate: -50% 0; opacity: 0; animation: slateIn .45s ease-out 1.35s forwards; }
  @keyframes slateIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  .clap { display: flex; height: 16px; border-radius: 3px 3px 0 0; overflow: hidden; transform-origin: 0 100%;
    transform: rotate(-24deg); animation: clap .22s cubic-bezier(.6,0,.9,.6) 2.05s forwards; }
  .clap b { flex: 1; background: #f3f1ea; transform: skewX(-30deg); } .clap b:nth-child(even) { background: #17181c; }
  @keyframes clap { to { transform: rotate(0); } }
  .slate-body { display: flex; justify-content: space-between; gap: 8px; padding: 7px 10px; background: #1c1d22; border: 1px solid #3a3b44; border-top: none;
    font: 600 11px/1 var(--font, sans-serif); color: #a9aab3; letter-spacing: .04em; }
  .action { color: #F2C230; opacity: 0; animation: act .2s ease-out 2.2s forwards; }
  @keyframes act { to { opacity: 1; } }

  .word { margin: 74px 0 0; font: 800 clamp(40px, 8vw, 84px)/1 var(--font, 'Archivo', sans-serif); font-stretch: 82%; letter-spacing: -.01em; display: flex; overflow: hidden; padding: 0 4px 6px; }
  .l { display: inline-block; white-space: pre; transform: translateY(110%); animation: up .6s cubic-bezier(.2,.9,.2,1) forwards; animation-delay: calc(1.05s + var(--i) * 45ms); }
  @keyframes up { to { transform: none; } }
  .tag { margin: 0; font: 500 clamp(14px, 2.2vw, 17px)/1.4 var(--font, sans-serif); color: #a9aab3; opacity: 0; animation: tag .6s ease-out 1.6s forwards; text-align: center; padding: 0 20px; }
  @keyframes tag { from { opacity: 0; letter-spacing: .12em; } to { opacity: 1; letter-spacing: .01em; } }

  .skip { position: absolute; right: max(20px, env(safe-area-inset-right)); bottom: max(20px, env(safe-area-inset-bottom)); height: 36px; padding: 0 14px;
    border-radius: 999px; border: 1px solid #3a3b44; background: rgba(23,24,28,.6); color: #a9aab3; font: 600 13px var(--font, sans-serif); cursor: pointer;
    opacity: 0; animation: tag .4s ease-out .6s forwards; }
  .skip:hover, .skip:focus-visible { color: #f3f1ea; border-color: #F2C230; outline: none; }
  .splash.out .skip { display: none; }
  `]
})
export class SplashComponent implements AfterViewInit, OnDestroy {
  readonly done = output<void>();
  readonly letters = [...'AI Casting'];
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private timers: ReturnType<typeof setTimeout>[] = [];
  private finished = false;
  private readonly onKey = (e: KeyboardEvent) => { if (['Escape', 'Enter', ' '].includes(e.key)) { e.preventDefault(); this.skip(); } };

  ngAfterViewInit(): void {
    document.addEventListener('keydown', this.onKey);
    this.zone.runOutsideAngular(() => this.timers.push(setTimeout(() => this.zone.run(() => this.open()), 2450)));
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
