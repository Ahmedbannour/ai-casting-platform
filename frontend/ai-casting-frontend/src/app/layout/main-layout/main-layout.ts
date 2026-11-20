import { NotificationBellComponent } from '../notification-bell/notification-bell';
import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar';
import { NavStateService } from '../nav-state.service';
import { MeService } from '../../core/services/me.service';
import { AuthService } from '../../core/services/auth.service';

/** Mise en page : menu latéral (tiroir sur mobile) + contenu animé + barre d'onglets en bas sur mobile. */
import { EmailBannerComponent } from './email-banner';
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SidebarComponent, NotificationBellComponent, EmailBannerComponent],
  styles: [`
    :host { display: flex; height: 100vh; height: 100dvh; width: 100%; overflow: hidden; }
    .content {
      flex: 1; min-width: 0; height: 100vh; height: 100dvh; overflow-y: auto; display: flex; flex-direction: column;
      view-transition-name: page;  /* zone animée lors du changement de page */
      /* Les pages s'adaptent à la place réellement disponible (menu ouvert ou replié), pas à la fenêtre. */
      container-type: inline-size; container-name: page;
    }
    .tabbar { display: none; }
    .m-bell { display: none !important; }
    .m-top { display: none; }
    .contract-banner { display: flex; align-items: flex-start; gap: 10px; margin: 16px 32px 0; padding: 12px 16px; border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--danger) 55%, var(--border)); background: color-mix(in srgb, var(--danger) 14%, var(--glass));
      color: var(--text-primary); font-size: 14px; line-height: 1.45; animation: bannerIn .3s ease-out both; }
    .contract-banner.warn { border-color: var(--accent); background: var(--accent-dim); }
    .contract-banner svg { flex: none; width: 18px; height: 18px; margin-top: 1px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    @keyframes bannerIn { from { opacity: 0; transform: translateY(-6px); } }
    @media (max-width: 860px) { .contract-banner { margin: 12px 14px 0; } }
    @media (max-width: 860px) {
      /* Sur téléphone, la hauteur suit l'écran réellement visible (100dvh, barres du navigateur exclues)
         et le bas de chaque page reste au-dessus de la barre d'onglets : 62 px de barre + 12 px d'écart + une marge. */
      /* Espace réservé en fin de page (un padding-bottom est ignoré par les colonnes flex qui défilent). */
      .content { scroll-padding-bottom: calc(100px + env(safe-area-inset-bottom, 0px)); }
      .content::after { content: ''; display: block; flex: none; height: calc(100px + env(safe-area-inset-bottom, 0px)); }
      /* T-132 · Barre du haut sur mobile : logo + cloche ; plus rien ne flotte au-dessus des pages */
      .m-top { display: flex; position: sticky; top: 0; z-index: 25; align-items: center; justify-content: space-between; gap: 10px;
        min-height: 54px; padding: 8px 14px; border-bottom: 1px solid var(--border);
        background: var(--glass-strong); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }
      .m-top .m-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; color: var(--text-primary); font-weight: 700; font-size: 16px; }
      .m-bell { display: inline-flex !important; }
      .tabbar {
        position: fixed; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 20; display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); grid-auto-flow: column;
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
      .tab.active svg { color: var(--accent-ink); transform: translateY(-2px) scale(1.08); }
      .tab:active svg { transform: scale(.9); }
    }
  `],
  template: `
    <app-sidebar />
    <div class="content">
      <header class="m-top">
        <a class="m-logo" [routerLink]="role() === 'ACTEUR' ? '/mon-profil' : role() === 'MARQUE' || role() === 'AGENCE_MARKETING' ? '/mes-demandes' : '/chat'" aria-label="AI Casting, accueil"><span class="brand-mark" aria-hidden="true"></span>AI Casting</a>
        <app-notification-bell class="m-bell" />
      </header>
      @if (contract(); as c) {
        <div class="contract-banner" [class.warn]="c.level === 'warn'" role="status">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
          <span>{{ c.text }}</span>
        </div>
      }
      <app-email-banner />
      <router-outlet />
    </div>


    <!-- Barre d'onglets (mobile uniquement) -->
    <nav class="tabbar" aria-label="Navigation">
      @if (role() === 'ACTEUR') {
      <a class="tab" routerLink="/mon-espace" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>
        Accueil
      </a>
      <a class="tab" routerLink="/mon-profil" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
        Profil
      </a>
      <a class="tab" routerLink="/mes-propositions" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>
        Propositions
      </a>
      } @else if (role() === 'MARQUE' || role() === 'AGENCE_MARKETING') {
      <a class="tab" routerLink="/mes-demandes" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z"/></svg>
        Demandes
      </a>
      <a class="tab" routerLink="/agenda" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
        Agenda
      </a>
      } @else {
      <a class="tab" routerLink="/accueil" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>
        Accueil
      </a>
      <a class="tab" routerLink="/chat" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        Propositions
      </a>
      <a class="tab" routerLink="/projects" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z"/></svg>
        Projets
      </a>
      <a class="tab" routerLink="/dashboard" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/></svg>
        Acteurs
      </a>
      }
      <button type="button" class="tab" (click)="nav.openDrawer()" aria-label="Ouvrir le menu et l'historique">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/></svg>
        Menu
      </button>
    </nav>
  `
})
export class MainLayoutComponent {
  readonly nav = inject(NavStateService);
  private readonly me = inject(MeService);
  private readonly auth = inject(AuthService);
  readonly role = computed(() => this.me.me()?.role ?? this.auth.role());

  /** Bandeau de l'agent : contrat inactif (lecture seule) ou qui se termine bientôt. */
  readonly contract = computed(() => {
    const m = this.me.me();
    if (!m || m.role !== 'BOITE_PROD' || !m.contractStatus) return null;
    const agence = m.agencyName ?? 'votre agence';
    if (m.contractStatus === 'EXPIRE') return { level: 'stop', text: `Le contrat de ${agence} a pris fin : vous pouvez consulter vos projets, mais plus les modifier ni lancer de recherche. Contactez la plateforme pour le renouveler.` };
    if (m.contractStatus === 'A_VENIR') return { level: 'stop', text: `Le contrat de ${agence} n'a pas encore commencé : accès en lecture seule jusqu'à son ouverture.` };
    if (m.contractStatus === 'SANS_AGENCE') return { level: 'stop', text: 'Votre compte n’est rattaché à aucune agence sous contrat : accès en lecture seule. Contactez l’administrateur.' };
    if (m.contractEnd) {
      const days = Math.round((Date.parse(m.contractEnd) - Date.now()) / 86400000);
      if (days >= 0 && days <= 30) return { level: 'warn', text: `Le contrat de ${agence} se termine dans ${days} jour${days > 1 ? 's' : ''}, le ${new Date(m.contractEnd).toLocaleDateString('fr-FR')}.` };
    }
    return null;
  });
}
