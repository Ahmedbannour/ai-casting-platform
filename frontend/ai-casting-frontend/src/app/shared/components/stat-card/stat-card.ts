import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="stat-card">
      <div class="stat-label">{{ label }}</div>
      <div class="stat-value">{{ value | number }}</div>
      <div class="stat-sub">{{ subtitle }}</div>
    </div>
  `,
  styles: [`
    .stat-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
      transition: border-color 0.15s;
      &:hover { border-color: var(--accent); }
    }
    .stat-label { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; font-weight: 500; }
    .stat-value { font-size: 28px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.5px; }
    .stat-sub { font-size: 11px; color: var(--text-subtle); margin-top: 4px; }
  `]
})
export class StatCardComponent {
  @Input() label = '';
  @Input() value = 0;
  @Input() subtitle = '';
}
