import { NotificationBellComponent } from '../notification-bell/notification-bell';
import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { ThemeService } from '../../core/services/theme.service';
import { AiSearchAngularService, HistoryItem } from '../../core/services/ai-search.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { ProjectService } from '../../core/services/project.service';
import { NavStateService } from '../nav-state.service';
import { MeService } from '../../core/services/me.service';

/** Une recherche de l'historique, dédoublonnée (même texte = une seule ligne). */
interface HistoryEntry { id: string; query: string; resultsCount: number; when: string; times: number; }
interface HistoryGroup { label: string; items: HistoryEntry[]; }
interface NavItem { path: string; label: string; key: string; icon: SafeHtml; }

const ICONS = {
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  projects: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z"/></svg>',
  profile: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  home: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  agenda: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  offers: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>',
  photos: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 8"/></svg>',
  admin: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
  actors: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/></svg>'
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NotificationBellComponent],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  host: { '[class.drawer]': 'nav.drawerOpen()' }
})
export class SidebarComponent implements OnInit, AfterViewInit {

  readonly themeService = inject(ThemeService);
  readonly nav = inject(NavStateService);
  private readonly aiService = inject(AiSearchAngularService);
  private readonly authService = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);
  private readonly projectService = inject(ProjectService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('navEl') navEl?: ElementRef<HTMLElement>;

  readonly meService = inject(MeService);
  /** Rôle connu tout de suite (mémorisé à la connexion), confirmé par /api/me. */
  readonly role = computed(() => this.meService.me()?.role ?? this.authService.role());
  readonly isActor = computed(() => this.role() === 'ACTEUR');

  private icon(k: keyof typeof ICONS): SafeHtml { return this.sanitizer.bypassSecurityTrustHtml(ICONS[k]); }

  /** Menu selon le rôle : l'acteur freelance ne voit que son espace ; l'administrateur a en plus l'administration. */
  readonly items = computed<NavItem[]>(() => {
    if (this.isActor()) {
      return [
        { path: '/mon-espace', label: 'Mon espace', key: 'Alt+1', icon: this.icon('home') },
        { path: '/mon-profil', label: 'Mon profil', key: 'Alt+2', icon: this.icon('profile') },
        { path: '/mon-profil/photos', label: 'Mes photos', key: 'Alt+3', icon: this.icon('photos') },
        { path: '/mes-propositions', label: 'Propositions', key: 'Alt+4', icon: this.icon('offers') },
        { path: '/agenda', label: 'Agenda', key: 'Alt+5', icon: this.icon('agenda') }
      ];
    }
    const items: NavItem[] = [
      { path: '/accueil', label: 'Accueil', key: 'Alt+1', icon: this.icon('home') },
      { path: '/chat', label: 'Recherche IA', key: 'Alt+2', icon: this.icon('search') },
      { path: '/projects', label: 'Projets', key: 'Alt+3', icon: this.icon('projects') },
      { path: '/dashboard', label: 'Acteurs', key: 'Alt+4', icon: this.icon('actors') },
      { path: '/agenda', label: 'Agenda', key: 'Alt+5', icon: this.icon('agenda') }
    ];
    if (this.role() === 'ADMIN') items.push({ path: '/admin', label: 'Administration', key: 'Alt+6', icon: this.icon('admin') });
    return items;
  });

  readonly roleLabel = computed(() => ({ ADMIN: 'Administrateur', AGENT: 'Agent de casting', ACTEUR: 'Acteur' } as Record<string, string>)[this.role() ?? ''] ?? '');

  private readonly history = signal<HistoryItem[]>([]);
  readonly loadingHistory = signal(true);
  private readonly totalActors = signal<number | null>(null);
  private readonly openProjects = signal<number | null>(null);
  readonly currentQuery = signal('');
  readonly gliderY = signal(0);
  readonly gliderH = signal(0);
  /** Le mode replié ne s'applique qu'aux écrans larges (sur mobile, le menu est un tiroir). */
  private readonly mq = typeof window === 'undefined' ? null : window.matchMedia('(min-width: 861px)');
  private readonly wide = signal(this.mq ? this.mq.matches : true);
  readonly collapsedView = computed(() => this.nav.collapsed() && this.wide());

  /** Historique dédoublonné et groupé : Aujourd'hui, Hier, Cette semaine, Plus ancien. */
  readonly groups = computed<HistoryGroup[]>(() => {
    const seen = new Map<string, HistoryEntry & { at: Date }>();
    for (const h of this.history()) {
      const key = h.query.trim().toLowerCase().replace(/\s+/g, ' ');
      const prev = seen.get(key);
      if (prev) { prev.times++; continue; }
      seen.set(key, { id: h.id, query: fixEncoding(h.query.trim()), resultsCount: h.resultsCount, when: '', times: 1, at: new Date(h.createdAt) });
    }
    const today = startOfDay(new Date()), day = 86_400_000;
    const buckets: HistoryGroup[] = [{ label: "Aujourd'hui", items: [] }, { label: 'Hier', items: [] }, { label: 'Cette semaine', items: [] }, { label: 'Plus ancien', items: [] }];
    for (const e of seen.values()) {
      const diff = today - startOfDay(e.at);
      const i = diff <= 0 ? 0 : diff <= day ? 1 : diff <= 6 * day ? 2 : 3;
      e.when = i <= 1 ? e.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                      : e.at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      buckets[i].items.push(e);
    }
    return buckets.filter(b => b.items.length);
  });

  ngOnInit(): void {
    this.meService.load().subscribe({ next: () => { this.queueGlider(); if (!this.isActor()) { this.loadHistory(); this.loadCounts(); } }, error: () => {} });
    if (!this.isActor()) {
      this.loadHistory();
      this.loadCounts();
    }
    this.aiService.historyChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadHistory());
    this.syncCurrent();
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncCurrent();
      if (!this.isActor()) this.loadCounts();
      this.queueGlider();
    });
  }

  ngAfterViewInit(): void {
    this.queueGlider();
    // Largeur d'écran : le mode replié ne vaut que sur écran large
    const onChange = () => { this.wide.set(!!this.mq?.matches); this.queueGlider(300); };
    this.mq?.addEventListener('change', onChange);
    this.destroyRef.onDestroy(() => this.mq?.removeEventListener('change', onChange));
  }

  /** Recalcule la position du repère après le rendu (et après l'animation de largeur si besoin). */
  queueGlider(delay = 0): void {
    requestAnimationFrame(() => setTimeout(() => this.moveGlider(), delay));
  }

  @HostListener('window:resize')
  onResize(): void { this.moveGlider(); }

  /** Raccourcis : Alt+1 recherche, Alt+2 projets, Alt+3 acteurs, Alt+N nouvelle recherche. */
  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    const target = /^[1-4]$/.test(k) ? this.items()[+k - 1]?.path ?? null : null;
    if (target) { e.preventDefault(); this.router.navigate([target]); }
    else if (k === 'n' && !this.isActor()) { e.preventDefault(); this.newChat(); }
  }

  count(path: string): number | null {
    return path === '/dashboard' ? this.totalActors() : path === '/projects' ? this.openProjects() : null;
  }

  toggleCollapse(): void {
    this.nav.toggleCollapsed();
    this.queueGlider(300);
  }

  newChat(): void {
    this.nav.closeDrawer();
    this.router.navigate(['/chat'], { queryParams: { n: Date.now() } });
  }

  openSearch(query: string): void {
    this.nav.closeDrawer();
    this.router.navigate(['/chat'], { queryParams: { q: query, t: Date.now() } });
  }

  logout(): void { this.authService.logout(); }

  private loadHistory(): void {
    this.aiService.getHistory(40).subscribe({
      next: h => { this.history.set(h); this.loadingHistory.set(false); },
      error: () => this.loadingHistory.set(false)
    });
  }

  private loadCounts(): void {
    this.dashboardService.getStats().subscribe({ next: s => this.totalActors.set(s.totalActors), error: () => {} });
    this.projectService.list('EN_COURS').subscribe({ next: p => this.openProjects.set(p.length), error: () => {} });
  }

  /** Place le repère jaune sous l'entrée active ; caché si aucune entrée ne correspond. */
  private moveGlider(): void {
    const root = this.navEl?.nativeElement;
    const active = root?.querySelector<HTMLElement>('.nav-link.active');
    if (!root || !active) { this.gliderH.set(0); return; }
    this.gliderY.set(active.offsetTop);
    this.gliderH.set(active.offsetHeight);
  }

  private syncCurrent(): void {
    this.currentQuery.set(this.router.parseUrl(this.router.url).queryParams['q'] ?? '');
  }
}

function startOfDay(d: Date): number { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }

/** Répare les anciennes recherches enregistrées avec un mauvais encodage (ex. « Ã  » au lieu de « à »). */
function fixEncoding(text: string): string {
  if (!/[ÃÂ]/.test(text)) return text;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from([...text].map(c => c.charCodeAt(0) & 0xff))); }
  catch { return text; }
}
