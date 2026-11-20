import { NotificationBellComponent } from '../notification-bell/notification-bell';
import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
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
      /* Barre d'onglets animée : une pastille jaune glisse sous l'onglet actif, l'icône rebondit,
         la barre se range quand on descend dans la page et revient dès qu'on remonte. */
      .tabbar {
        position: fixed; left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 20;
        display: grid; grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr));
        height: 64px; padding: 6px; border-radius: 22px; border: 1px solid var(--border);
        background: var(--glass-strong); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
        box-shadow: 0 18px 44px color-mix(in srgb, var(--graphite-950) 38%, transparent), inset 0 1px 0 color-mix(in srgb, var(--graphite-0) 8%, transparent);
        transition: transform .38s cubic-bezier(.2,.9,.3,1), opacity .25s;
        animation: tabbarIn .55s cubic-bezier(.2,1.2,.4,1) .1s both;
      }
      .tabbar.hidden { transform: translateY(calc(100% + 28px)); opacity: 0; pointer-events: none; }
      @keyframes tabbarIn { from { transform: translateY(calc(100% + 28px)); opacity: 0; } }
      /* La pastille qui suit l'onglet actif */
      .pill {
        position: absolute; top: 6px; bottom: 6px; left: 6px; width: calc((100% - 12px) / var(--n, 4));
        transform: translateX(calc(var(--i, 0) * 100%)); transition: transform .45s cubic-bezier(.3,1.35,.45,1), opacity .2s;
        pointer-events: none; z-index: 0;
      }
      .pill::before { content: ''; position: absolute; inset: 0 4px; border-radius: 16px; background: var(--accent-dim);
        border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
      .pill::after { content: ''; position: absolute; left: 50%; bottom: -1px; width: 22px; height: 3px; margin-left: -11px; border-radius: 3px;
        background: var(--accent); box-shadow: 0 0 12px var(--accent); }
      .tabbar:not(.has-active) .pill { opacity: 0; }
      .tabbar.moving .pill::before { animation: stretch .45s ease-out; }
      @keyframes stretch { 40% { transform: scaleX(1.18) scaleY(.92); } }
      .tab {
        position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
        border: none; border-radius: 16px; background: transparent; color: var(--text-muted); font-size: 11px; font-weight: 600;
        text-decoration: none; cursor: pointer; transition: color .2s, transform .15s; -webkit-tap-highlight-color: transparent;
      }
      .tab svg { transition: transform .3s cubic-bezier(.2,1.4,.4,1), color .2s; }
      .tab span { transition: letter-spacing .25s, opacity .2s; opacity: .85; }
      .tab.active { color: var(--text-primary); }
      .tab.active span { opacity: 1; letter-spacing: .01em; }
      .tab.active svg { color: var(--accent-ink); animation: pop .5s cubic-bezier(.2,1.5,.4,1); transform: translateY(-2px); }
      @keyframes pop { 0% { transform: scale(.7) translateY(2px); } 55% { transform: scale(1.22) translateY(-4px) rotate(-6deg); } 100% { transform: translateY(-2px); } }
      .tab:active { transform: scale(.92); }
      /* Bouton Menu : les trois traits bougent */
      .tab.menu svg path { transition: transform .3s cubic-bezier(.2,1.4,.4,1); transform-origin: center; }
      .tab.menu:active svg path:nth-child(1) { transform: translateY(2px); }
      .tab.menu:active svg path:nth-child(3) { transform: translateY(-2px) scaleX(1.6); }
      .tab.menu svg path:nth-child(3) { transform-origin: 4px 17px; }
      @media (prefers-reduced-motion: reduce) {
        .tabbar, .pill, .tab, .tab svg { transition: none !important; animation: none !important; }
      }
    }
  `],
  template: `
    <app-sidebar />
    <div class="content" (scroll)="onScroll($event)">
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
    <nav #tabbar class="tabbar" [class.hidden]="tabHidden()" aria-label="Navigation">
      <span class="pill" aria-hidden="true"></span>
      @if (role() === 'ACTEUR') {
      <a class="tab" routerLink="/mon-espace" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>
        <span>Accueil</span>
      </a>
      <a class="tab" routerLink="/mon-profil" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
        <span>Profil</span>
      </a>
      <a class="tab" routerLink="/mes-propositions" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>
        <span>Propositions</span>
      </a>
      } @else if (role() === 'MARQUE' || role() === 'AGENCE_MARKETING') {
      <a class="tab" routerLink="/mes-demandes" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z"/></svg>
        <span>Demandes</span>
      </a>
      <a class="tab" routerLink="/agenda" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
        <span>Agenda</span>
      </a>
      } @else {
      <a class="tab" routerLink="/accueil" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>
        <span>Accueil</span>
      </a>
      <a class="tab" routerLink="/chat" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <span>Propositions</span>
      </a>
      <a class="tab" routerLink="/projects" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1z"/></svg>
        <span>Projets</span>
      </a>
      <a class="tab" routerLink="/dashboard" routerLinkActive="active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/></svg>
        <span>Acteurs</span>
      </a>
      }
      <button type="button" class="tab menu" (click)="nav.openDrawer()" aria-label="Ouvrir le menu et l'historique">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h10"/></svg>
        <span>Menu</span>
      </button>
    </nav>
  `
})
export class MainLayoutComponent {
  readonly nav = inject(NavStateService);
  private readonly me = inject(MeService);
  private readonly auth = inject(AuthService);
  readonly role = computed(() => this.me.me()?.role ?? this.auth.role());

  /* --- Barre d'onglets animée (mobile) --- */
  private readonly tabbar = viewChild<ElementRef<HTMLElement>>('tabbar');
  readonly tabHidden = signal(false);
  private lastY = 0;

  constructor() {
    const router = inject(Router);
    const sub = router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      this.tabHidden.set(false);
      requestAnimationFrame(() => this.placePill());
    });
    inject(DestroyRef).onDestroy(() => sub.unsubscribe());
    afterNextRender(() => { this.placePill(false); setTimeout(() => this.placePill(false), 300); });
  }

  /** Place la pastille sous l'onglet actif (index et nombre d'onglets en variables CSS). */
  private placePill(animate = true) {
    const bar = this.tabbar()?.nativeElement;
    if (!bar) return;
    const tabs = Array.from(bar.querySelectorAll<HTMLElement>('.tab'));
    const i = tabs.findIndex(t => t.classList.contains('active'));
    const prev = bar.style.getPropertyValue('--i');
    bar.style.setProperty('--n', String(tabs.length));
    bar.classList.toggle('has-active', i >= 0);
    if (i < 0) return;
    bar.style.setProperty('--i', String(i));
    if (animate && prev !== '' && prev !== String(i)) {
      bar.classList.remove('moving'); void bar.offsetWidth; bar.classList.add('moving');
    }
  }

  /** La barre se range quand on descend dans la page et revient dès qu'on remonte. */
  onScroll(e: Event) {
    const y = (e.target as HTMLElement).scrollTop;
    const d = y - this.lastY;
    if (Math.abs(d) < 8) return;
    this.tabHidden.set(d > 0 && y > 120);
    this.lastY = y;
  }

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
