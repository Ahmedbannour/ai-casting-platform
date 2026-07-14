import { Component, OnInit, signal, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AiSearchAngularService, SearchResponse } from '../../core/services/ai-search.service';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content?: string;
  response?: SearchResponse;
  loading?: boolean;
  timestamp: Date;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.scss'
})
export class ChatComponent implements AfterViewChecked {

  @ViewChild('messagesEnd') messagesEnd!: ElementRef;

  messages = signal<ChatMessage[]>([]);
  input = '';
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

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
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
