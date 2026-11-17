import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { LOCATION } from './map-scene';

interface Brief { label: string; text: string; keep: number[]; ko: number[]; why: string; }
interface Frame { n: number; tone: string; shape: 0 | 1 | 2; }
type Profile = 'AGENCE' | 'ACTEUR' | 'AUTRE';

const BRIEFS: Brief[] = [
  { label: 'Actrice, Tunis', text: 'Actrice de 25 à 35 ans, basée à Tunis, parle arabe et français, disponible en mars.',
    keep: [1, 6, 9], ko: [3, 10], why: 'Tunis · 29 ans · arabe, français · libre en mars' },
  { label: 'Père de famille', text: 'Homme d’une quarantaine d’années, voix grave, à l’aise à cheval, pour un tournage dans le Sud.',
    keep: [0, 7], ko: [4, 5, 11], why: '43 ans · équitation · déjà tourné à Tozeur' },
  { label: 'Rôle d’enfant', text: 'Garçon d’environ 10 ans, vif et drôle, disponible pendant les vacances de juillet.',
    keep: [2, 8, 11], ko: [0], why: '10 ans · accord des parents · libre en juillet' },
];
/** Adresse publique de contact, assemblée seulement au clic (les robots ramasseurs d'adresses ne la lisent pas dans la page). */
const MAIL = ['ahmedla9lou9', 'gmail.com'];

/** Page vitrine publique : présente AI Casting aux visiteurs non connectés. */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './landing.html',
  styleUrl: './landing.scss'
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('scene') sceneRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('mapEl') mapRef?: ElementRef<HTMLElement>;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly http = inject(HttpClient);

  readonly briefs = BRIEFS;
  readonly frames: Frame[] = ['#4A4C55', '#5A5650', '#43474F', '#504C47', '#474B53', '#55524C',
    '#4D4A52', '#45494E', '#58544D', '#4B4E56', '#52504A', '#484A51']
    .map((tone, n) => ({ n, tone, shape: (n * 7 % 3) as 0 | 1 | 2 }));
  readonly year = new Date().getFullYear();
  readonly place = LOCATION;
  readonly finalWords = 'Le bon visage pour le bon rôle.'.split(' ');
  readonly strip = ['Décrire', 'Comparer', 'Proposer', 'Planche contact', 'Vivier', 'Lien réalisateur', 'Disponibilités', 'Présélection'];

  readonly active = signal(0);
  readonly typed = signal('');
  readonly phase = signal<'typing' | 'sorting' | 'marked'>('typing');
  readonly menu = signal(false);
  readonly section = signal('');
  readonly mail = signal('');
  readonly copied = signal(false);
  readonly mapState = signal<'idle' | 'ready' | 'error'>('idle');

  // Formulaire de contact
  form = { name: '', email: '', organisation: '', message: '', website: '' };
  readonly profile = signal<Profile>('AGENCE');
  readonly errors = signal<Record<string, string>>({});
  readonly sending = signal(false);
  readonly sent = signal(false);
  readonly sendError = signal('');

  private timers: ReturnType<typeof setTimeout>[] = [];
  private auto = true;
  private cleanups: (() => void)[] = [];
  readonly still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  ngOnInit(): void {
    this.play(0);
    if (!this.still) {
      // Haut de page prêt à s'animer dès le premier affichage ; filet de sécurité si GSAP ne se charge pas.
      const el = this.host.nativeElement as HTMLElement;
      el.classList.add('motion');
      const t = setTimeout(() => el.classList.remove('motion'), 2500);
      this.cleanups.push(() => clearTimeout(t));
    }
  }

  ngAfterViewInit(): void {
    this.watchSections();
    this.watchMap();
    if (this.still) return;
    // Les effets se chargent après l'affichage : la page est lisible tout de suite.
    const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(cb, { timeout: 800 }) : setTimeout(cb, 200));
    this.startMotion();
    const canvas = this.sceneRef?.nativeElement;
    if (canvas && this.webgl()) {
      idle(() => import('./hero-scene').then(m => m.startHeroScene(canvas, canvas.parentElement!))
        .then(stop => { this.cleanups.push(stop); canvas.classList.add('on'); }).catch(() => {}));
    }
  }

  ngOnDestroy(): void { this.clear(); this.cleanups.forEach(f => f()); }

  // ── Planche contact ─────────────────
  choose(i: number): void { this.auto = false; this.play(i); }
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
    this.later(step, 500);
    this.later(() => { if (this.auto) this.play((i + 1) % BRIEFS.length); }, 10000);
  }
  private later(fn: () => void, ms: number): void { this.timers.push(setTimeout(fn, ms)); }
  private clear(): void { this.timers.forEach(clearTimeout); this.timers = []; }

  // ── Navigation ──────────────────────
  go(id: string, e?: Event): void {
    e?.preventDefault(); this.menu.set(false);
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: this.still ? 'auto' : 'smooth', block: 'start' });
    if (id === 'contact') setTimeout(() => (document.getElementById('c-name') as HTMLInputElement | null)?.focus({ preventScroll: true }), this.still ? 0 : 700);
  }

  private watchSections(): void {
    const ids = ['methode', 'agences', 'acteurs', 'engagements', 'contact'];
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) this.section.set(e.target.id);
    }, { rootMargin: '-45% 0px -50% 0px' });
    ids.forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
    this.cleanups.push(() => io.disconnect());
  }

  // ── Contact ─────────────────────────
  showMail(): void { this.mail.set(MAIL.join('@')); }
  copyMail(): void {
    navigator.clipboard?.writeText(this.mail()).then(() => { this.copied.set(true); setTimeout(() => this.copied.set(false), 2500); });
  }

  fieldErr(k: string): string { return this.errors()[k] ?? ''; }
  clearErr(k: string): void { if (this.errors()[k]) { const e = { ...this.errors() }; delete e[k]; this.errors.set(e); } this.sendError.set(''); }

  submit(): void {
    const f = this.form, e: Record<string, string> = {};
    if (f.name.trim().length < 2) e['name'] = 'Indiquez votre nom.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email.trim())) e['email'] = 'Adresse e-mail incomplète (ex. nom@domaine.tn).';
    if (f.message.trim().length < 10) e['message'] = 'Quelques mots de plus (10 caractères au moins).';
    this.errors.set(e);
    if (Object.keys(e).length) { document.getElementById('c-' + Object.keys(e)[0])?.focus(); return; }
    this.sending.set(true); this.sendError.set('');
    this.http.post(`${environment.apiUrl}/public/contact`, { ...f, profile: this.profile() }).subscribe({
      next: () => { this.sending.set(false); this.sent.set(true); },
      error: (err: HttpErrorResponse) => {
        this.sending.set(false);
        this.sendError.set(err.status === 0 ? 'Serveur injoignable. Réessayez dans un instant.' : err.error?.message ?? 'Envoi impossible. Réessayez.');
      }
    });
  }
  again(): void { this.form = { name: '', email: '', organisation: '', message: '', website: '' }; this.sent.set(false); }

  // ── Carte ───────────────────────────
  private watchMap(): void {
    const el = this.mapRef?.nativeElement;
    if (!el) return;
    let api: { fly: () => void; destroy: () => void } | null = null, loading = false;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      if (!api && !loading && this.webgl()) {
        loading = true;
        try {
          const m = await import('./map-scene');
          api = await m.startMap(el, this.still, () => this.mapState.set('error'));
          this.mapState.set('ready');
          this.cleanups.push(() => api?.destroy());
        } catch { this.mapState.set('error'); }
      }
      if (api && e.intersectionRatio > 0.4) api.fly();
    }, { rootMargin: '300px 0px', threshold: [0, 0.45] });
    io.observe(el);
    if (!this.webgl()) this.mapState.set('error');
    this.cleanups.push(() => io.disconnect());
  }

  private webgl(): boolean {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }

  // ── Animations GSAP ─────────────────
  private async startMotion(): Promise<void> {
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
    gsap.registerPlugin(ScrollTrigger);
    const root = this.host.nativeElement as HTMLElement;
    const ctx = gsap.context(() => {
      const below = (sel: string) => ({ trigger: sel, start: 'top 82%', once: true });
      root.classList.remove('motion');
      gsap.fromTo('.h1-line > span', { yPercent: 105 }, { yPercent: 0, duration: 1.05, ease: 'power4.out', stagger: 0.12 });
      gsap.fromTo('.hero .lead, .hero .cta, .hero .fine', { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, ease: 'power3.out', stagger: 0.08, delay: 0.45 });
      gsap.fromTo('.desk', { y: 48, rotate: 2.5, autoAlpha: 0 }, { y: 0, rotate: 0, autoAlpha: 1, duration: 1.1, ease: 'power3.out', delay: 0.25 });
      gsap.to('.sheet', { y: 70, rotate: -3, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 } });
      gsap.to('.strip-track', { xPercent: -50, duration: 38, ease: 'none', repeat: -1 });
      gsap.from('.steps li', { y: 40, autoAlpha: 0, duration: 0.8, ease: 'power3.out', stagger: 0.14, scrollTrigger: below('.steps') });
      gsap.from('.steps .n', { scale: 0.3, rotate: -14, duration: 0.8, ease: 'back.out(2.2)', stagger: 0.14, scrollTrigger: below('.steps') });
      gsap.from('.side', { y: 60, autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.15, scrollTrigger: below('.duo') });
      gsap.from('.side li', { x: -14, autoAlpha: 0, duration: 0.5, ease: 'power2.out', stagger: 0.05, scrollTrigger: below('.duo') });
      gsap.from('.promesses .grid > div', { y: 30, autoAlpha: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1, scrollTrigger: below('.promesses .grid') });
      gsap.from('.contact-card, .map-wrap', { y: 50, autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.15, scrollTrigger: below('.contact') });
      gsap.from('.final .w', { yPercent: 110, rotate: 6, duration: 0.9, ease: 'back.out(1.5)', stagger: 0.06, scrollTrigger: { trigger: '.final', start: 'top 75%', once: true } });
      // Boutons principaux légèrement « aimantés » par le pointeur (souris seulement)
      if (matchMedia('(hover: hover)').matches) {
        root.querySelectorAll<HTMLElement>('.btn.big').forEach(b => {
          const x = gsap.quickTo(b, 'x', { duration: 0.4, ease: 'power3' }), y = gsap.quickTo(b, 'y', { duration: 0.4, ease: 'power3' });
          b.addEventListener('pointermove', ev => { const r = b.getBoundingClientRect(); x((ev.clientX - r.left - r.width / 2) * 0.18); y((ev.clientY - r.top - r.height / 2) * 0.25); });
          b.addEventListener('pointerleave', () => { x(0); y(0); });
        });
      }
    }, root);
    this.cleanups.push(() => ctx.revert());
  }
}
