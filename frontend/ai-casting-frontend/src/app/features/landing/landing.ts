import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Brief { label: string; text: string; keep: number[]; ko: number[]; why: string; }
interface Frame { n: number; tone: string; shape: 0 | 1 | 2; }

const BRIEFS: Brief[] = [
  { label: 'Actrice, Tunis', text: 'Actrice de 25 à 35 ans, basée à Tunis, parle arabe et français, disponible en mars.',
    keep: [1, 6, 9], ko: [3, 10], why: 'Tunis · 29 ans · arabe, français · libre en mars' },
  { label: 'Père de famille', text: 'Homme d’une quarantaine d’années, voix grave, à l’aise à cheval, pour un tournage dans le Sud.',
    keep: [0, 7], ko: [4, 5, 11], why: '43 ans · équitation · déjà tourné à Tozeur' },
  { label: 'Rôle d’enfant', text: 'Garçon d’environ 10 ans, vif et drôle, disponible pendant les vacances de juillet.',
    keep: [2, 8, 11], ko: [0], why: '10 ans · accord des parents · libre en juillet' },
];

/** Page vitrine publique : présente AI Casting aux visiteurs non connectés. */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.scss'
})
export class LandingComponent implements OnInit, OnDestroy {
  readonly briefs = BRIEFS;
  readonly frames: Frame[] = ['#4A4C55', '#5A5650', '#43474F', '#504C47', '#474B53', '#55524C',
    '#4D4A52', '#45494E', '#58544D', '#4B4E56', '#52504A', '#484A51']
    .map((tone, n) => ({ n, tone, shape: (n * 7 % 3) as 0 | 1 | 2 }));
  readonly year = new Date().getFullYear();

  readonly active = signal(0);
  readonly typed = signal('');
  readonly phase = signal<'typing' | 'sorting' | 'marked'>('typing');
  readonly menu = signal(false);

  private timers: ReturnType<typeof setTimeout>[] = [];
  private auto = true;
  private readonly still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  ngOnInit(): void { this.play(0); }
  ngOnDestroy(): void { this.clear(); }

  /** Choix d'un rôle par le visiteur : on rejoue la planche et on arrête le défilement automatique. */
  choose(i: number): void { this.auto = false; this.play(i); }

  /** Rang du profil parmi les retenus (-1 s'il n'est pas retenu) : sert à décaler le trait de crayon. */
  keep(n: number): number { return BRIEFS[this.active()].keep.indexOf(n); }
  ko(n: number): boolean { return BRIEFS[this.active()].ko.includes(n); }
  firstKeep(): number { return BRIEFS[this.active()].keep[0]; }

  private play(i: number): void {
    this.clear();
    this.active.set(i);
    const text = BRIEFS[i].text;
    if (this.still) { this.typed.set(text); this.phase.set('marked'); return; }
    this.typed.set(''); this.phase.set('typing');
    let k = 0;
    const step = () => {
      k = Math.min(text.length, k + 2);
      this.typed.set(text.slice(0, k));
      if (k < text.length) this.later(step, 22);
      else this.later(() => { this.phase.set('sorting'); this.later(() => this.phase.set('marked'), 650); }, 250);
    };
    this.later(step, 300);
    this.later(() => { if (this.auto) this.play((i + 1) % BRIEFS.length); }, 9500);
  }

  private later(fn: () => void, ms: number): void { this.timers.push(setTimeout(fn, ms)); }
  private clear(): void { this.timers.forEach(clearTimeout); this.timers = []; }

  go(id: string, e?: Event): void {
    e?.preventDefault(); this.menu.set(false);
    document.getElementById(id)?.scrollIntoView({ behavior: this.still ? 'auto' : 'smooth', block: 'start' });
  }
}
