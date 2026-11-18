import { Component, OnInit, signal, computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AiSearchAngularService, SearchResponse } from '../../core/services/ai-search.service';
import { DeckMemory, SwipeDeckComponent, SwipeEvent } from '../../shared/components/swipe-deck/swipe-deck';
import { CastingRole, CastingService } from '../../core/services/casting.service';
import { RouterLink } from '@angular/router';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content?: string;
  response?: SearchResponse;
  loading?: boolean;
  explaining?: boolean;
  loadingMore?: boolean;
  /** Position et décisions dans la pile de cette recherche. */
  memory?: DeckMemory;
  timestamp: Date;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, SwipeDeckComponent, RouterLink],
  templateUrl: './chat.html',
  styleUrl: './chat.scss'
})
export class ChatComponent implements OnInit {

  messages = signal<ChatMessage[]>([]);
  input = '';
  /** Affichage des propositions : cartes à glisser (par défaut) ou liste. */
  view = signal<'cartes' | 'liste'>('cartes');
  loading = signal(false);

  suggestions = [
    'Je cherche une femme entre 25 et 35 ans parlant français',
    'Acteur homme de 40 ans basé à Paris',
    'Comédienne parlant anglais et espagnol',
    'Acteur avec compétences en danse et chant'
  ];

  constructor(
    private aiService: AiSearchAngularService,
    private router: Router
  ) {}

  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly casting = inject(CastingService);

  /** Rôle pour lequel on cherche (lien « Trouver des acteurs ») : les cartes retenues vont dans sa shortlist. */
  readonly roleCtx = signal<CastingRole | null>(null);
  /** Acteurs déjà dans la shortlist du rôle : ils ne sont pas reproposés (US-06). */
  private readonly inShortlist = new Set<string>();

  /**
   * Pilotage par l'URL :
   *  - ?q=… (menu « Historique ») : nouvelle conversation qui relance cette recherche ;
   *  - ?n=… (bouton « Nouvelle recherche ») : conversation vide, même si on est déjà sur la page.
   */
  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const q = params.get('q');
      const roleId = params.get('role');
      if (roleId) { this.reset(); this.loadRole(roleId, q); return; }
      this.roleCtx.set(null);
      this.inShortlist.clear();
      if (q) { this.reset(); this.send(q); }
      else if (params.has('n')) { this.reset(); }
    });
  }

  /** Mode « rôle » : bandeau, phrase de recherche pré-remplie (modifiable avant envoi), shortlist exclue. */
  private loadRole(roleId: string, q: string | null): void {
    this.casting.role(roleId).subscribe({
      next: r => {
        this.roleCtx.set(r);
        this.casting.shortlist(roleId).subscribe(list => {
          this.inShortlist.clear();
          list.forEach(e => this.inShortlist.add(e.actorId));
          if (q) this.send(q); else this.input = r.searchPrompt;
        });
      },
      error: () => { this.roleCtx.set(null); if (q) this.send(q); }
    });
  }

  leaveRole(): void {
    this.router.navigate(['/chat'], { queryParams: { n: Date.now() } });
  }

  private reset(): void {
    this.messages.set([]);
    this.input = '';
    this.loading.set(false);
    this.views.set(new Map());
  }

  // ── Conversation ──
  /** Affichage choisi pour chaque réponse : cartes (par défaut) ou liste. */
  private readonly views = signal<Map<number, 'cartes' | 'liste'>>(new Map());
  viewOf(i: number): 'cartes' | 'liste' { return this.views().get(i) ?? 'cartes'; }
  setView(i: number, v: 'cartes' | 'liste'): void { this.views.update(m => new Map(m).set(i, v)); }

  /** « Critères compris : Femme · Comédie — 52 profil(s) trouvé(s) » → [Femme, Comédie] */
  criteria(interp: string): string[] {
    if (!interp) return [];
    let t = interp.includes(':') ? interp.slice(interp.indexOf(':') + 1) : interp;
    t = t.split('—')[0];
    return t.split('·').map(x => x.trim()).filter(x => x && !/profil/i.test(x)).slice(0, 6);
  }

  retry(i: number): void { const q = this.messages()[i - 1]?.content; if (q) this.send(q); }

  /**
   * Défilement, une seule fois par étape (jamais à chaque rafraîchissement) :
   *  - à l'envoi : la demande arrive en haut de la zone ;
   *  - à la réponse : la réponse se cale dans la zone visible, fiche et boutons entiers.
   * Ensuite l'utilisateur fait défiler librement toute la conversation.
   */
  private scrollTo(i: number, where: 'start' | 'answer'): void {
    setTimeout(() => {
      const list = document.querySelector('.messages-list') as HTMLElement | null;
      const el = list?.querySelector(`[data-i="${i}"]`) as HTMLElement | null;
      if (!list || !el) return;
      const top = el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
      const target = where === 'start' ? top - 12 : top + el.offsetHeight - list.clientHeight + 8;
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      list.scrollTo({ top: Math.max(0, where === 'answer' ? Math.min(target, top - 8) : target), behavior: still ? 'auto' : 'smooth' });
    }, 60);
  }

  send(query?: string): void {
    const text = query || this.input.trim();
    if (!text || this.loading()) return;
    this.input = '';
    this.loading.set(true);

    this.messages.update(m => [...m, {
      role: 'user', content: text, timestamp: new Date()
    }]);
    this.messages.update(m => [...m, {
      role: 'assistant', loading: true, timestamp: new Date()
    }]);
    this.scrollTo(this.messages().length - 2, 'start');

    this.aiService.search(text).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.messages.update(msgs => {
          const updated = [...msgs];
          const visible = this.roleCtx()
            ? { ...response, results: response.results.filter(r => !this.inShortlist.has(r.id)) }
            : response;
          updated[updated.length - 1] = {
            role: 'assistant', response: visible, loading: false, timestamp: new Date(),
            memory: { index: 0, history: [] }
          };
          return updated;
        });
        this.scrollTo(this.messages().length - 1, 'answer');
        const shown = this.messages()[this.messages().length - 1].response?.results ?? [];
        this.explain(this.messages().length - 1, text, shown.slice(0, 5).map(r => r.id));
        this.aiService.historyChanged.next();
      },
      error: () => {
        this.loading.set(false);
        this.messages.update(msgs => {
          const updated = [...msgs];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: 'Une erreur est survenue. Veuillez réessayer.',
            loading: false, timestamp: new Date()
          };
          return updated;
        });
      }
    });
  }

  /** Demande à l'IA d'expliquer les 5 meilleurs profils, sans bloquer l'affichage. */
  private explain(index: number, query: string, ids: string[]): void {
    if (!ids.length) return;
    this.patch(index, m => ({ ...m, explaining: true }));
    this.aiService.explain(query, ids).subscribe({
      next: (reasons) => this.patch(index, m => ({
        ...m,
        explaining: false,
        response: m.response && {
          ...m.response,
          results: m.response.results.map(r => reasons[r.id] ? { ...r, reason: reasons[r.id] } : r)
        }
      })),
      error: () => this.patch(index, m => ({ ...m, explaining: false }))
    });
  }

  /** Charge la page suivante des résultats et l'ajoute à la suite. */
  loadMore(index: number): void {
    const msg = this.messages()[index];
    if (!msg?.response || msg.loadingMore) return;
    this.patch(index, m => ({ ...m, loadingMore: true }));
    this.aiService.search(msg.response.query, msg.response.page + 1).subscribe({
      next: (next) => this.patch(index, m => ({
        ...m,
        loadingMore: false,
        response: m.response && {
          ...m.response,
          page: next.page,
          hasMore: next.hasMore,
          results: [...m.response.results, ...next.results]
        }
      })),
      error: () => this.patch(index, m => ({ ...m, loadingMore: false }))
    });
  }

  private patch(index: number, fn: (m: ChatMessage) => ChatMessage): void {
    this.messages.update(list => list.map((m, i) => i === index ? fn(m) : m));
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  /** Enregistre la décision du client (signal d'apprentissage pour l'IA). */
  onDecide(index: number, e: SwipeEvent): void {
    const q = this.messages()[index]?.response?.query ?? '';
    const role = this.roleCtx();
    this.aiService.feedback(q, e.actor.id, e.decision, role?.id).subscribe({ error: () => {} });
    if (role) {
      if (e.decision === 'RETENU') this.inShortlist.add(e.actor.id);
      if (e.decision === 'ANNULE') this.inShortlist.delete(e.actor.id);
    }
  }

  isLastAssistant(index: number): boolean {
    const msgs = this.messages();
    for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].role === 'assistant') return i === index; }
    return false;
  }

  openActor(id: string): void {
    this.router.navigate(['/actors', id]);
  }

  getScorePercent(score: number): number {
    return Math.round(score * 100);
  }

  getScoreColor(score: number): string {
    if (score >= 0.75) return '#10A37F';
    if (score >= 0.5) return '#F59E0B';
    return '#8E8EA0';
  }

  getScoreLabel(score: number): string {
    const p = this.getScorePercent(score);
    if (p >= 75) return 'Excellent';
    if (p >= 50) return 'Bon';
    return 'Partiel';
  }

  get isEmpty(): boolean { return this.messages().length === 0; }
}
