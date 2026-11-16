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

/** Une recherche de l'historique, dédoublonnée (même texte = une seule ligne). */
interface HistoryEntry { id: string; query: string; resultsCount: number; when: string; times: number; }
interface HistoryGroup { label: string; items: HistoryEntry[]; }
interface NavItem { path: string; label: string; key: string; icon: SafeHtml; }

const ICONS = {
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  projects: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z"/></svg>',
  actors: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/></svg>'
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
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

  readonly items: NavItem[] = [
    { path: '/chat', label: 'Recherche IA', key: 'Alt+1', icon: this.sanitizer.bypassSecurityTrustHtml(ICONS.search) },
    { path: '/projects', label: 'Projets', key: 'Alt+2', icon: this.sanitizer.bypassSecurityTrustHtml(ICONS.projects) },
    { path: '/dashboard', label: 'Acteurs', key: 'Alt+3', icon: this.sanitizer.bypassSecurityTrustHtml(ICONS.actors) }
  ];

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
    this.loadHistory();
    this.loadCounts();
    this.aiService.historyChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadHistory());
    this.syncCurrent();
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.syncCurrent();
      this.loadCounts();
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
    const target = k === '1' ? '/chat' : k === '2' ? '/projects' : k === '3' ? '/dashboard' : null;
    if (target) { e.preventDefault(); this.router.navigate([target]); }
    else if (k === 'n') { e.preventDefault(); this.newChat(); }
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
