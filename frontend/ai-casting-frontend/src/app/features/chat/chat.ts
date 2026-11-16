import { Component, OnInit, signal, ViewChild, ElementRef, AfterViewChecked, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AiSearchAngularService, SearchResponse } from '../../core/services/ai-search.service';
import { SwipeDeckComponent, SwipeEvent } from '../../shared/components/swipe-deck/swipe-deck';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content?: string;
  response?: SearchResponse;
  loading?: boolean;
  explaining?: boolean;
  loadingMore?: boolean;
  timestamp: Date;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, SwipeDeckComponent],
  templateUrl: './chat.html',
  styleUrl: './chat.scss'
})
export class ChatComponent implements OnInit, AfterViewChecked {

  @ViewChild('messagesEnd') messagesEnd!: ElementRef;

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

  /**
   * Pilotage par l'URL :
   *  - ?q=… (menu « Historique ») : nouvelle conversation qui relance cette recherche ;
   *  - ?n=… (bouton « Nouvelle recherche ») : conversation vide, même si on est déjà sur la page.
   */
  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const q = params.get('q');
      if (q) { this.reset(); this.send(q); }
      else if (params.has('n')) { this.reset(); }
    });
  }

  private reset(): void {
    this.messages.set([]);
    this.input = '';
    this.loading.set(false);
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
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

    this.aiService.search(text).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.messages.update(msgs => {
          const updated = [...msgs];
          updated[updated.length - 1] = {
            role: 'assistant', response, loading: false, timestamp: new Date()
          };
          return updated;
        });
        this.explain(this.messages().length - 1, text, response.results.slice(0, 5).map(r => r.id));
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
    this.aiService.feedback(q, e.actor.id, e.decision).subscribe({ error: () => {} });
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

  private scrollToBottom(): void {
    try { this.messagesEnd?.nativeElement?.scrollIntoView({ behavior: 'smooth' }); } catch {}
  }

  get isEmpty(): boolean { return this.messages().length === 0; }
}
