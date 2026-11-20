import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActorSummary } from '../../../core/services/actor.service';

@Component({
  selector: 'app-actor-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="actor-card" (click)="view.emit(actor.id)">
      <div class="actor-initials">{{ actor.firstName[0] }}{{ actor.lastName[0] }}</div>
      <div class="actor-name">{{ actor.firstName }} {{ actor.lastName }}</div>
      <div class="actor-location">{{ actor.city || '—' }}, {{ actor.country || '—' }}</div>
      <div class="actor-meta">{{ actor.gender || '—' }} · {{ actor.height ? actor.height + ' cm' : '—' }}</div>
      <div class="actor-actions">
        <button (click)="$event.stopPropagation(); gallery.emit(actor.id)" class="action-btn">Photos</button>
        <button (click)="$event.stopPropagation(); edit.emit(actor.id)" class="action-btn">Modifier</button>
        <button (click)="$event.stopPropagation(); delete.emit(actor.id)" class="action-btn danger">×</button>
      </div>
    </div>
  `,
  styles: [`
    .actor-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px;
      cursor: pointer;
      transition: all 0.15s;
      &:hover { border-color: var(--accent); transform: translateY(-2px); }
    }
    .actor-initials {
      width: 48px; height: 48px; border-radius: 50%;
      background: var(--accent-dim); border: 2px solid var(--accent);
      color: var(--accent-ink); font-size: 16px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 12px;
    }
    .actor-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
    .actor-location { font-size: 12px; color: var(--text-muted); margin: 4px 0; }
    .actor-meta { font-size: 11px; color: var(--text-subtle); margin-bottom: 14px; }
    .actor-actions { display: flex; gap: 6px; }
    .action-btn {
      font-size: 11px; padding: 4px 10px; border-radius: 6px;
      border: 1px solid var(--border); background: transparent;
      color: var(--text-muted); cursor: pointer; transition: all 0.15s;
      &:hover { border-color: var(--accent); color: var(--accent-ink); }
      &.danger:hover { border-color: var(--danger); color: var(--danger); }
    }
  `]
})
export class ActorCardComponent {
  @Input() actor!: ActorSummary;
  @Output() view = new EventEmitter<string>();
  @Output() edit = new EventEmitter<string>();
  @Output() delete = new EventEmitter<string>();
  @Output() gallery = new EventEmitter<string>();
}
