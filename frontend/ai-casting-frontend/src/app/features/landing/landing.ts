import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { LOCATION } from './map-scene';

/** Profil fictif de la démonstration (aucune personne réelle). */
interface Card { name: string; age: number; city: string; tags: string[]; match: boolean; why: string; tone: string; shape: 0 | 1 | 2; }
interface Brief { label: string; text: string; cards: Card[]; }
type Choice = 'keep' | 'ko';
type Profile = 'AGENCE' | 'ACTEUR' | 'AUTRE';

const c = (name: string, age: number, city: string, tags: string[], match: boolean, why: string, tone: string, shape: 0 | 1 | 2): Card =>
  ({ name, age, city, tags, match, why, tone, shape });

const BRIEFS: Brief[] = [
  { label: 'Actrice, Tunis', text: 'Actrice de 25 à 35 ans, basée à Tunis, parle arabe et français, disponible en mars.', cards: [
    c('Yasmine', 29, 'Tunis', ['Arabe', 'Français'], true, 'Tunis · libre en mars', '#5A5650', 1),
    c('Salma', 41, 'Sfax', ['Arabe'], false, 'Hors de la tranche d’âge', '#4A4C55', 1),
    c('Rim', 33, 'La Marsa', ['Arabe', 'Français', 'Anglais'], true, 'Trilingue · 20 min de Tunis', '#4D4A52', 1),
    c('Ines', 26, 'Sousse', ['Arabe', 'Italien'], false, 'Pas de français déclaré', '#504C47', 1),
    c('Nour', 31, 'Tunis', ['Arabe', 'Français'], true, 'Déjà tourné à Tunis en mars', '#45494E', 1)] },
  { label: 'Père de famille', text: 'Homme d’une quarantaine d’années, voix grave, à l’aise à cheval, pour un tournage dans le Sud.', cards: [
    c('Karim', 43, 'Tozeur', ['Équitation', 'Voix grave'], true, 'Vit dans le Sud · cavalier', '#55524C', 2),
    c('Mehdi', 28, 'Tunis', ['Danse'], false, 'Trop jeune pour le rôle', '#474B53', 0),
    c('Hédi', 46, 'Gabès', ['Équitation'], true, 'Cavalier · déjà tourné à Tozeur', '#58544D', 2),
    c('Sami', 39, 'Bizerte', ['Doublage'], false, 'Pas d’équitation déclarée', '#4B4E56', 0),
    c('Anis', 44, 'Kairouan', ['Voix grave', 'Équitation'], true, 'Voix grave · disponible', '#52504A', 0)] },
  { label: 'Rôle d’enfant', text: 'Garçon d’environ 10 ans, vif et drôle, disponible pendant les vacances de juillet.', cards: [
    c('Adam', 10, 'Tunis', ['Théâtre'], true, 'Accord des parents · libre en juillet', '#4D4A52', 0),
    c('Youssef', 14, 'Sousse', ['Football'], false, '14 ans : trop âgé', '#43474F', 2),
    c('Ilyes', 9, 'Ariana', ['Humour', 'Chant'], true, 'Déjà une pub télé', '#5A5650', 0),
    c('Rayen', 11, 'Nabeul', ['Natation'], false, 'Indisponible en juillet', '#484A51', 2),
    c('Aziz', 10, 'Monastir', ['Théâtre'], true, 'Accord des parents', '#504C47', 0)] },
];
const MAIL = ['ahmedla9lou9', 'gmail.com'];
const SCENES: Record<string, string> = {
  contenu: 'Accueil', methode: 'Comment ça marche', agences: 'Agences', acteurs: 'Acteurs', engagements: 'Vos données', contact: 'Contact',
};

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
  @ViewChild('wipe') wipeRef?: ElementRef<HTMLElement>;
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly http = inject(HttpClient);

  readonly briefs = BRIEFS;
  readonly year = new Date().getFullYear();
  readonly place = LOCATION;
  readonly finalWords = 'Le bon visage pour le bon rôle.'.split(' ');
  readonly strip = ['Décrire', 'Comparer', 'Proposer', 'Planche contact', 'Vivier', 'Lien réalisateur', 'Disponibilités', 'Présélection'];
  readonly sceneIds = Object.keys(SCENES);

  // ── Démonstration : fiches à faire glisser ──
  readonly active = signal(0);
  readonly typed = signal('');
  readonly idx = signal(0);
  readonly choices = signal<Choice[]>([]);
  readonly dx = signal(0);
  readonly dy = signal(0);
  readonly dragging = signal(false);
  readonly leaving = signal<Choice | null>(null);
  readonly touched = signal(false);
  readonly cards = computed(() => BRIEFS[this.active()].cards);
  readonly done = computed(() => this.idx() >= this.cards().length);
  readonly kept = computed(() => this.choices().filter(x => x === 'keep').length);
  readonly agree = computed(() => this.choices().filter((x, i) => (x === 'keep') === this.cards()[i].match).length);
  readonly lean = computed(() => Math.max(-1, Math.min(1, this.dx() / 110)));
  readonly stampKeep = computed(() => this.leaving() === 'keep' ? 1 : Math.max(0, this.lean()));
  readonly stampKo = computed(() => this.leaving() === 'ko' ? 1 : Math.max(0, -this.lean()));

  // ── Navigation, contact, carte ──
  readonly menu = signal(false);
  readonly section = signal('');
  readonly wipeLabel = signal('');
  readonly wipeNum = signal(1);
  readonly mail = signal('');
  readonly copied = signal(false);
  readonly mapState = signal<'idle' | 'ready' | 'error'>('idle');
  form = { name: '', email: '', organisation: '', message: '', website: '' };
  readonly profile = signal<Profile>('AGENCE');
  readonly errors = signal<Record<string, string>>({});
  readonly sending = signal(false);
  readonly sent = signal(false);
  readonly sendError = signal('');

  private timers: ReturnType<typeof setTimeout>[] = [];
  private cleanups: (() => void)[] = [];
  private gsap: any = null;
  private sx = 0; private sy = 0;
  readonly still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  ngOnInit(): void {
    this.pick(0, false);
    if (!this.still) {
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
    this.startMotion();
    const canvas = this.sceneRef?.nativeElement;
    const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(cb, { timeout: 900 }) : setTimeout(cb, 250));
    if (canvas && this.webgl()) {
      idle(() => import('./hero-scene').then(m => m.startHeroScene(canvas, canvas.parentElement!))
        .then(stop => { this.cleanups.push(stop); canvas.classList.add('on'); }).catch(() => {}));
    }
  }

  ngOnDestroy(): void { this.clear(); this.cleanups.forEach(f => f()); }

  // ── Fiches ──────────────────────────
  pick(i: number, user = true): void {
    this.clear();
    this.active.set(i); this.idx.set(0); this.choices.set([]); this.dx.set(0); this.dy.set(0); this.leaving.set(null);
    if (user) this.touched.set(true);
    const text = BRIEFS[i].text;
    if (this.still) { this.typed.set(text); return; }
    this.typed.set('');
    let k = 0;
    const step = () => { k = Math.min(text.length, k + 3); this.typed.set(text.slice(0, k)); if (k < text.length) this.later(step, 16); };
    this.later(step, user ? 60 : 500);
  }

  down(e: PointerEvent): void {
    if (this.leaving() || this.done()) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.sx = e.clientX; this.sy = e.clientY; this.dragging.set(true); this.touched.set(true);
  }
  move(e: PointerEvent): void {
    if (!this.dragging()) return;
    this.dx.set(e.clientX - this.sx); this.dy.set(e.clientY - this.sy);
  }
  up(): void {
    if (!this.dragging()) return;
    this.dragging.set(false);
    const d = this.dx();
    if (Math.abs(d) > 100) this.decide(d > 0 ? 'keep' : 'ko');
    else { this.dx.set(0); this.dy.set(0); }
  }
  key(e: KeyboardEvent): void {
    if (e.key === 'ArrowRight') { e.preventDefault(); this.decide('keep'); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.decide('ko'); }
  }
  decide(k: Choice): void {
    if (this.leaving() || this.done()) return;
    this.touched.set(true);
    this.leaving.set(k);
    this.dx.set(k === 'keep' ? 640 : -640); this.dy.set(this.dy() + 40);
    navigator.vibrate?.(8);
    this.later(() => {
      this.choices.set([...this.choices(), k]); this.idx.set(this.idx() + 1);
      this.leaving.set(null); this.dx.set(0); this.dy.set(0);
    }, this.still ? 0 : 330);
  }
  replay(): void { this.pick(this.active()); }
  next(): void { this.pick((this.active() + 1) % BRIEFS.length); }

  /** Style de chaque fiche de la pile : la première suit le doigt, les suivantes attendent derrière. */
  cardStyle(i: number): Record<string, string> {
    const depth = i - this.idx();
    if (depth === 0) {
      const anim = this.dragging() ? 'none' : 'transform .33s cubic-bezier(.2,.8,.3,1)';
      return { transform: `translate(${this.dx()}px, ${this.dy() * 0.35}px) rotate(${this.dx() * 0.05}deg)`, transition: anim, zIndex: '5' };
    }
    const p = Math.min(1, Math.abs(this.lean()));
    const d = Math.max(0, depth - p);
    return { transform: `translateY(${d * 14}px) scale(${1 - d * 0.05})`, transition: 'transform .33s ease', zIndex: String(5 - depth) };
  }

  private later(fn: () => void, ms: number): void { this.timers.push(setTimeout(fn, ms)); }
  private clear(): void { this.timers.forEach(clearTimeout); this.timers = []; }

  // ── Navigation : rideau de cinéma entre les scènes ──
  go(id: string, e?: Event): void {
    e?.preventDefault(); this.menu.set(false);
    const el = document.getElementById(id);
    if (!el) return;
    const navH = (this.host.nativeElement as HTMLElement).querySelector('.nav')?.getBoundingClientRect().height ?? 64;
    const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - (id === 'contenu' ? 0 : navH - 1));
    const after = () => { if (id === 'contact') (document.getElementById('c-name') as HTMLInputElement | null)?.focus({ preventScroll: true }); };
    const w = this.wipeRef?.nativeElement, g = this.gsap;
    if (this.still || !g || !w) { window.scrollTo({ top, behavior: this.still ? 'auto' : 'smooth' }); setTimeout(after, this.still ? 0 : 700); return; }
    this.wipeLabel.set(SCENES[id] ?? ''); this.wipeNum.set(this.sceneIds.indexOf(id) + 1);
    g.killTweensOf(w);
    g.timeline()
      .set(w, { autoAlpha: 1, yPercent: 100 })
      .to(w, { yPercent: 0, duration: 0.42, ease: 'power3.in' })
      .fromTo(w.querySelectorAll('.wipe-line > *'), { yPercent: 110 }, { yPercent: 0, duration: 0.38, ease: 'power3.out', stagger: 0.05 }, '-=0.12')
      .add(() => window.scrollTo({ top, behavior: 'instant' as ScrollBehavior }))
      .to(w, { yPercent: -100, duration: 0.55, ease: 'power3.inOut', delay: 0.2 })
      .set(w, { autoAlpha: 0 })
      .add(after);
  }

  private watchSections(): void {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) this.section.set(e.target.id);
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['contenu', 'methode', 'agences', 'acteurs', 'engagements', 'contact'].forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
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
    try { const cv = document.createElement('canvas'); return !!(cv.getContext('webgl2') || cv.getContext('webgl')); } catch { return false; }
  }

  // ── Animations GSAP ─────────────────
  private async startMotion(): Promise<void> {
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
    gsap.registerPlugin(ScrollTrigger);
    this.gsap = gsap;
    const root = this.host.nativeElement as HTMLElement;
    const ctx = gsap.context(() => {
      const below = (sel: string) => ({ trigger: sel, start: 'top 82%', once: true });
      root.classList.remove('motion');
      gsap.fromTo('.h1-line > span', { yPercent: 105 }, { yPercent: 0, duration: 1.05, ease: 'power4.out', stagger: 0.12 });
      gsap.fromTo('.hero .lead, .hero .cta, .hero .fine', { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, ease: 'power3.out', stagger: 0.08, delay: 0.45 });
      gsap.fromTo('.desk', { y: 48, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.1, ease: 'power3.out', delay: 0.25 });
      gsap.fromTo('.deck .face', { y: 90, rotate: (i: number) => (1 - i) * 7, autoAlpha: 0 },
        { y: 0, rotate: 0, autoAlpha: 1, duration: 0.9, ease: 'back.out(1.4)', stagger: { each: 0.09, from: 'end' }, delay: 0.55, clearProps: 'transform,opacity,visibility' });
      gsap.to('.strip-track', { xPercent: -50, duration: 38, ease: 'none', repeat: -1 });
      gsap.from('.steps li', { y: 40, autoAlpha: 0, duration: 0.8, ease: 'power3.out', stagger: 0.14, scrollTrigger: below('.steps') });
      gsap.from('.steps .n', { scale: 0.3, rotate: -14, duration: 0.8, ease: 'back.out(2.2)', stagger: 0.14, scrollTrigger: below('.steps') });
      gsap.from('.side', { y: 60, autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.15, scrollTrigger: below('.duo') });
      gsap.from('.side li', { x: -14, autoAlpha: 0, duration: 0.5, ease: 'power2.out', stagger: 0.05, scrollTrigger: below('.duo') });
      gsap.from('.promesses .grid > div', { y: 30, autoAlpha: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1, scrollTrigger: below('.promesses .grid') });
      gsap.from('.contact-card, .map-wrap', { y: 50, autoAlpha: 0, duration: 0.9, ease: 'power3.out', stagger: 0.15, scrollTrigger: below('.contact') });
      gsap.from('.final .w', { yPercent: 110, rotate: 6, duration: 0.9, ease: 'back.out(1.5)', stagger: 0.06, scrollTrigger: { trigger: '.final', start: 'top 75%', once: true } });
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
