import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar';
import { NavStateService } from '../nav-state.service';

/** Mise en page : menu latéral (tiroir sur mobile) + contenu animé + barre d'onglets en bas sur mobile. */
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SidebarComponent],
  styles: [`
    :host { display: flex; height: 100vh; width: 100%; overflow: hidden; }
    .content {
      flex: 1; min-width: 0; height: 100vh; overflow-y: auto; display: flex; flex-direction: column;
      view-transition-name: page;  /* zone animée lors du changement de page */
    }
    .tabbar { display: none; }
    @media (max-width: 860px) {
      .content { padding-bottom: 76px; }
      .tabbar {
        position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 20; display: grid; grid-template-columns: repeat(4, 1fr);
        height: 62px; padding: 6px; border-radius: 20px; border: 1px solid var(--border);
        background: var(--glass-strong); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
        box-shadow: 0 16px 40px rgba(0,0,0,.35);
      }
      .tab {
        position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
        border: none; border-radius: 14px; background: transparent; color: var(--text-muted); font-size: 11px; font-weight: 600;
        text-decoration: none; cursor: pointer; transition: color .15s, background .2s;
      }
      .tab svg { transition: transform .25s cubic-bezier(.2,1.4,.4,1); }
      .tab.active { color: var(--text-primary); background: var(--accent-dim); }
      .tab.active svg { color: var(--accent); transform: translateY(-2px) scale(1.08); }
      .tab:active svg { transform: scale(.9); }
    }
  `],
  template: `
    <app-sidebar />
    <div class="content">
      <router-outlet />
    </div>

    <!-- Barre d'onglets (mobile uniquement) -->
    <nav class="tabbar" aria-label="Navigation">
      <a class="tab" routerLink="/chat" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        Recherche
      </a>
      <a class="tab" routerLink="/projects" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z"/></svg>
        Projets
      </a>
      <a class="tab" routerLink="/dashboard" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/></svg>
        Acteurs
      </a>
      <button type="button" class="tab" (click)="nav.openDrawer()" aria-label="Ouvrir le menu et l'historique">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
        Menu
      </button>
    </nav>
  `
})
export class MainLayoutComponent {
  readonly nav = inject(NavStateService);
}
