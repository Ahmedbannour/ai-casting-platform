import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { ThemeService } from '../../core/services/theme.service';
import { AiSearchAngularService, HistoryItem } from '../../core/services/ai-search.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';

/** Une recherche de l'historique, dédoublonnée (même texte = une seule ligne). */
interface HistoryEntry {
  id: string;
  query: string;
  resultsCount: number;
  when: string;
  times: number;
}

interface HistoryGroup { label: string; items: HistoryEntry[]; }

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss'
})
export class SidebarComponent implements OnInit {

  readonly themeService = inject(ThemeService);
  private readonly aiService = inject(AiSearchAngularService);
  private readonly authService = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly history = signal<HistoryItem[]>([]);
  readonly loadingHistory = signal(true);
  readonly totalActors = signal<number | null>(null);
  /** Recherche affichée en ce moment (paramètre ?q= de l'URL), pour la mettre en évidence. */
  readonly currentQuery = signal<string>('');

  /** Historique dédoublonné et groupé : Aujourd'hui, Hier, Cette semaine, Plus ancien. */
  readonly groups = computed<HistoryGroup[]>(() => {
    const seen = new Map<string, HistoryEntry & { at: Date }>();
    for (const h of this.history()) {
      const key = h.query.trim().toLowerCase().replace(/\s+/g, ' ');
      const at = new Date(h.createdAt);
      const prev = seen.get(key);
      if (prev) { prev.times++; continue; }          // l'API renvoie la plus récente en premier
      seen.set(key, { id: h.id, query: fixEncoding(h.query.trim()), resultsCount: h.resultsCount, when: '', times: 1, at });
    }
    const today = startOfDay(new Date());
    const day = 86_400_000;
    const buckets: HistoryGroup[] = [
      { label: "Aujourd'hui", items: [] }, { label: 'Hier', items: [] },
      { label: 'Cette semaine', items: [] }, { label: 'Plus ancien', items: [] }
    ];
    for (const e of seen.values()) {
      const diff = today - startOfDay(e.at);
      const i = diff <= 0 ? 0 : diff <= day ? 1 : diff <= 6 * day ? 2 : 3;
      e.when = i <= 1
        ? e.at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : e.at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      buckets[i].items.push(e);
    }
    return buckets.filter(b => b.items.length);
  });

  ngOnInit(): void {
    this.loadHistory();
    this.dashboardService.getStats().subscribe({ next: s => this.totalActors.set(s.totalActors), error: () => {} });
    // L'historique se met à jour dès qu'une recherche est faite
    this.aiService.historyChanged.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadHistory());
    // Recherche courante = paramètre ?q= de l'URL
    this.syncCurrent();
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncCurrent());
  }

  loadHistory(): void {
    this.aiService.getHistory(40).subscribe({
      next: h => { this.history.set(h); this.loadingHistory.set(false); },
      error: () => this.loadingHistory.set(false)
    });
  }

  /** Ouvre une conversation vide (le paramètre « n » force la remise à zéro, même déjà sur /chat). */
  newChat(): void {
    this.router.navigate(['/chat'], { queryParams: { n: Date.now() } });
  }

  /** Relance une recherche de l'historique. */
  openSearch(query: string): void {
    this.router.navigate(['/chat'], { queryParams: { q: query, t: Date.now() } });
  }

  logout(): void {
    this.authService.logout();
  }

  private syncCurrent(): void {
    const tree = this.router.parseUrl(this.router.url);
    this.currentQuery.set(tree.queryParams['q'] ?? '');
  }
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Répare les anciennes recherches enregistrées avec un mauvais encodage (ex. « Ã  » au lieu de « à »). */
function fixEncoding(text: string): string {
  if (!/[ÃÂ]/.test(text)) return text;
  try {
    const bytes = Uint8Array.from([...text].map(c => c.charCodeAt(0) & 0xff));
    const fixed = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return fixed;
  } catch { return text; }
}
