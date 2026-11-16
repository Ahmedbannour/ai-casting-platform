import { Injectable, signal } from '@angular/core';

/** État partagé de la navigation : menu replié (mémorisé) et tiroir ouvert sur mobile. */
@Injectable({ providedIn: 'root' })
export class NavStateService {
  readonly collapsed = signal<boolean>(read());
  readonly drawerOpen = signal(false);

  toggleCollapsed(): void {
    this.collapsed.update(v => !v);
    try { localStorage.setItem('casting_nav_collapsed', this.collapsed() ? '1' : '0'); } catch { /* stockage indisponible */ }
  }

  openDrawer(): void { this.drawerOpen.set(true); }
  closeDrawer(): void { this.drawerOpen.set(false); }
}

function read(): boolean {
  try { return localStorage.getItem('casting_nav_collapsed') === '1'; } catch { return false; }
}
