import { Component, NgZone, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { BrandService } from '../../../core/services/brand.service';

interface Toast { id: number; kind: 'ok' | 'err'; text: string; leaving: boolean; }

/**
 * Confirmations à l'image du métier : un clap qui claque, aux couleurs et au nom de la boîte de production,
 * « C'est dans la boîte ! » et une pellicule qui défile le temps de lire. Toujours en haut de l'écran, donc toujours vu.
 *
 * Aucun écran n'a besoin d'être modifié : chaque message de confirmation (élément .ok[role=status]) qui apparaît
 * ou change est repris ici ; l'original reste dans la page pour les lecteurs d'écran, mais n'est plus affiché.
 */
@Component({
  selector: 'app-toast-host',
  standalone: true,
  template: `
  <div class="stack" aria-hidden="true">
    @for (t of toasts(); track t.id) {
      <div class="toast" [class.err]="t.kind === 'err'" [class.leaving]="t.leaving" (mouseenter)="hold(t, true)" (mouseleave)="hold(t, false)">
        <div class="clap">
          <div class="stick"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="slate">
            <span class="prod">{{ studio() }}</span>
            <span class="take">PRISE {{ t.id }}</span>
          </div>
          <span class="spark s1"></span><span class="spark s2"></span><span class="spark s3"></span>
        </div>
        <div class="txt">
          <b>{{ t.kind === 'err' ? 'Coupez !' : 'C’est dans la boîte !' }}</b>
          <span>{{ t.text }}</span>
        </div>
        <button type="button" class="x" (click)="close(t.id)" tabindex="-1">✕</button>
        <div class="film" [style.animation-play-state]="held() === t.id ? 'paused' : 'running'" (animationend)="close(t.id)"></div>
      </div>
    }
  </div>`,
  styles: [`
  :host { position: fixed; z-index: 1000; top: calc(14px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%);
    width: min(460px, calc(100vw - 24px)); pointer-events: none; }
  .stack { display: flex; flex-direction: column; gap: 10px; }
  .toast { pointer-events: auto; position: relative; display: flex; align-items: center; gap: 14px; padding: 12px 40px 16px 12px; overflow: hidden;
    border-radius: 18px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
    background: color-mix(in srgb, var(--bg-surface) 92%, transparent); -webkit-backdrop-filter: blur(14px) saturate(1.3); backdrop-filter: blur(14px) saturate(1.3);
    box-shadow: 0 18px 50px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.03) inset;
    animation: drop .55s cubic-bezier(.2,1.25,.35,1) both; }
  .toast.leaving { animation: lift .3s ease-in both; }
  .toast.err { border-color: color-mix(in srgb, var(--danger) 55%, var(--border)); }

  /* Le clap : ardoise au nom de la boîte, claquette aux couleurs de la marque */
  .clap { position: relative; flex: none; width: 78px; height: 58px; }
  .slate { position: absolute; left: 0; right: 0; bottom: 0; height: 42px; border-radius: 6px; background: #17181c; color: #f4f1ea;
    display: flex; flex-direction: column; justify-content: center; padding: 3px 6px; gap: 2px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
  .prod { font-size: 8.5px; font-weight: 800; letter-spacing: .02em; line-height: 1.1; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  .take { font-size: 7.5px; font-weight: 700; color: rgba(244,241,234,.6); letter-spacing: .08em; }
  .stick { position: absolute; left: 0; right: 0; top: 2px; height: 13px; border-radius: 3px; display: flex; overflow: hidden; background: #17181c;
    transform-origin: 3px 100%; animation: clap .7s cubic-bezier(.3,1.6,.4,1) .12s both; box-shadow: 0 2px 4px rgba(0,0,0,.3); }
  .stick i { flex: 1; background: var(--accent); transform: skewX(-30deg); margin: 0 3px; }
  .toast.err .stick i { background: var(--danger); }
  .spark { position: absolute; width: 3px; height: 8px; border-radius: 2px; background: var(--accent); opacity: 0; top: 10px; }
  .s1 { right: -6px; transform: rotate(60deg); } .s2 { right: -2px; top: 0; transform: rotate(25deg); } .s3 { right: 8px; top: -6px; transform: rotate(-5deg); }
  .spark { animation: spark .5s ease-out .48s both; }
  .toast.err .spark { background: var(--danger); }

  .txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .txt b { font-size: 12px; font-weight: 800; letter-spacing: .02em; color: var(--accent-ink); animation: rise .4s ease-out .3s both; }
  .toast.err .txt b { color: var(--danger); }
  .txt span { font-size: 14.5px; font-weight: 600; color: var(--text-primary); line-height: 1.4; animation: rise .4s ease-out .38s both; }
  .x { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border: 0; border-radius: 8px; background: transparent; color: var(--text-subtle);
    cursor: pointer; font-size: 12px; }
  .x:hover { background: var(--bg-hover); color: var(--text-primary); }

  /* La pellicule défile le temps de lire, puis le message s'en va (en pause au survol) */
  .film { position: absolute; left: 0; bottom: 0; height: 6px; width: 100%; transform-origin: left;
    background: repeating-linear-gradient(90deg, var(--accent) 0 7px, transparent 7px 11px); opacity: .85;
    animation: film 4.2s linear .3s both; }
  .toast.err .film { background: repeating-linear-gradient(90deg, var(--danger) 0 7px, transparent 7px 11px); animation-duration: 6s; }

  @keyframes drop { from { opacity: 0; transform: translateY(-26px) scale(.94); } to { opacity: 1; transform: none; } }
  @keyframes lift { to { opacity: 0; transform: translateY(-16px) scale(.97); } }
  @keyframes clap { 0% { transform: rotate(-32deg); } 55% { transform: rotate(3deg); } 75% { transform: rotate(-4deg); } 100% { transform: rotate(0); } }
  @keyframes spark { 0% { opacity: 0; translate: 0 0; } 30% { opacity: 1; } 100% { opacity: 0; translate: 6px -6px; } }
  @keyframes rise { from { opacity: 0; transform: translateY(5px); } }
  @keyframes film { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  @media (max-width: 860px) { :host { top: calc(10px + env(safe-area-inset-top, 0px)); } .clap { width: 68px; height: 52px; } .slate { height: 38px; } }
  @media (prefers-reduced-motion: reduce) {
    .toast, .stick, .spark, .txt b, .txt span { animation: none !important; } .toast.leaving { opacity: 0; }
  }
  `]
})
export class ToastHostComponent implements OnInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly brand = inject(BrandService);
  readonly toasts = signal<Toast[]>([]);
  readonly held = signal<number | null>(null);
  private seq = 0;
  private observer?: MutationObserver;
  private readonly seen = new WeakMap<Element, string>();

  /** Le nom inscrit sur l'ardoise : la boîte de production affichée (sa marque), sinon Cercle. */
  studio(): string { return (this.brand.shown()?.name || 'Cercle').toUpperCase(); }

  ngOnInit(): void {
    if (typeof document === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      let queued = false;   // un seul passage par image, même si la page change beaucoup
      this.observer = new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; this.scan(); }); });
      this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  }
  ngOnDestroy(): void { this.observer?.disconnect(); }

  private scan(): void {
    document.querySelectorAll<HTMLElement>('.ok[role="status"]').forEach(el => {
      const text = (el.textContent || '').trim();
      if (!text || this.seen.get(el) === text) return;
      this.seen.set(el, text);
      el.classList.add('toasted');
      this.zone.run(() => this.push('ok', text));
    });
  }

  push(kind: 'ok' | 'err', text: string): void {
    const id = ++this.seq;
    this.toasts.update(l => [...l.filter(t => t.text !== text).slice(-2), { id, kind, text, leaving: false }]);
  }

  hold(t: Toast, on: boolean): void { this.held.set(on ? t.id : null); }

  close(id: number): void {
    this.toasts.update(l => l.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => this.toasts.update(l => l.filter(t => t.id !== id)), 300);
  }
}
