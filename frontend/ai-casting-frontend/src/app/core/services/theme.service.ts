import { Injectable, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

/**
 * Manages dark/light theme toggle with persistence.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {

  theme = signal<Theme>('dark');

  constructor() {
    const saved = localStorage.getItem('casting_theme') as Theme;
    this.apply(saved || 'dark');
  }

  toggle(): void {
    this.apply(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private apply(theme: Theme): void {
    this.theme.set(theme);
    localStorage.setItem('casting_theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }
}
