import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { homeRedirect, roleGuard } from './core/guards/role.guard';
import { consentGuard } from './features/legal/consent.guard';
import { visitorOnly } from './features/landing/visitor.guard';

/** Pages de l'agence (agents et administrateurs). */
const agence = roleGuard('ADMIN', 'AGENT');
import { MainLayoutComponent } from './layout/main-layout/main-layout';

export const routes: Routes = [
  {
    // Vitrine publique : visiteurs non connectés (un utilisateur connecté va à son espace)
    path: '',
    pathMatch: 'full',
    canActivate: [visitorOnly],
    loadComponent: () => import('./features/landing/landing').then(m => m.LandingComponent),
    title: 'AI Casting · Décrivez le rôle, nous préparons la planche'
  },
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./features/auth/login/login.component')
        .then(m => m.LoginComponent)
  },
  {
    path: 'auth/inscription',
    loadComponent: () =>
      import('./features/auth/login/login.component')
        .then(m => m.LoginComponent),
    data: { mode: 'inscription' }
  },
  {
    path: 'legal/conditions',
    loadComponent: () => import('./features/legal/legal-page').then(m => m.LegalPageComponent),
    data: { doc: 'conditions' },
    title: 'Conditions d’utilisation · AI Casting'
  },
  {
    path: 'legal/confidentialite',
    loadComponent: () => import('./features/legal/legal-page').then(m => m.LegalPageComponent),
    data: { doc: 'confidentialite' },
    title: 'Politique de confidentialité · AI Casting'
  },
  {
    // T-113 · lien de vérification de l'adresse e-mail (public, à usage unique)
    path: 'verification/:token',
    loadComponent: () => import('./features/legal/verify-page').then(m => m.VerifyPageComponent),
    title: 'Vérification de l’adresse e-mail · AI Casting'
  },
  {
    // T-112 · lien de réinitialisation du mot de passe (public, à usage unique, 1 heure)
    path: 'reinitialisation/:token',
    loadComponent: () => import('./features/legal/reset-page').then(m => m.ResetPageComponent),
    title: 'Nouveau mot de passe · AI Casting'
  },
  {
    // T-102 · lien d'invitation d'un acteur (public, à usage unique)
    path: 'invitation/:token',
    loadComponent: () => import('./features/legal/invitation-page').then(m => m.InvitationPageComponent),
    title: 'Invitation · AI Casting'
  },
  {
    // T-101 · accord demandé quand il manque ou que les textes ont changé
    path: 'consentement',
    canActivate: [authGuard],
    loadComponent: () => import('./features/legal/consent-page').then(m => m.ConsentPageComponent)
  },
  {
    // Page du réalisateur : publique, ouverte par lien secret
    path: 'partage/:token',
    loadComponent: () =>
      import('./features/share/director-share')
        .then(m => m.DirectorShareComponent)
  },
  {
    path: 'roles/:id/planche',
    canActivate: [authGuard, consentGuard, agence],
    loadComponent: () =>
      import('./features/projects/role-sheet')
        .then(m => m.RoleSheetComponent)
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard, consentGuard],
    children: [
      // ── Espace de l'acteur freelance ──
      {
        path: 'mon-espace',
        canActivate: [roleGuard('ACTEUR')],
        loadComponent: () =>
          import('./features/espace/actor-home')
            .then(m => m.ActorHomeComponent)
      },
      {
        path: 'mon-profil',
        canActivate: [roleGuard('ACTEUR')],
        loadComponent: () =>
          import('./features/actors/actor-form/actor-form')
            .then(m => m.ActorFormComponent),
        data: { self: true }
      },
      {
        path: 'mon-profil/photos',
        canActivate: [roleGuard('ACTEUR')],
        loadComponent: () =>
          import('./features/actors/gallery/actor-gallery')
            .then(m => m.ActorGalleryComponent),
        data: { self: true }
      },
      {
        path: 'mes-propositions',
        canActivate: [roleGuard('ACTEUR')],
        loadComponent: () =>
          import('./features/offers/my-offers')
            .then(m => m.MyOffersComponent)
      },
      // ── Agenda des auditions (T-116) : agence et acteur ──
      {
        path: 'agenda',
        loadComponent: () =>
          import('./features/agenda/agenda')
            .then(m => m.AgendaComponent)
      },
      // ── Administration ──
      {
        path: 'admin',
        canActivate: [roleGuard('ADMIN')],
        loadComponent: () =>
          import('./features/admin/admin')
            .then(m => m.AdminComponent)
      },
      // ── Agence ──
      {
        path: 'accueil',
        canActivate: [agence],
        loadComponent: () =>
          import('./features/espace/accueil')
            .then(m => m.AccueilComponent)
      },
      {
        path: 'chat',
        canActivate: [agence],
        loadComponent: () =>
          import('./features/chat/chat')
            .then(m => m.ChatComponent)
      },
      {
        path: 'projects',
        canActivate: [agence],
        loadComponent: () =>
          import('./features/projects/projects')
            .then(m => m.ProjectsComponent)
      },
      {
        path: 'projects/:id',
        canActivate: [agence],
        loadComponent: () =>
          import('./features/projects/project-detail')
            .then(m => m.ProjectDetailComponent)
      },
      {
        path: 'roles/:id',
        canActivate: [agence],
        loadComponent: () =>
          import('./features/projects/role-detail')
            .then(m => m.RoleDetailComponent)
      },
      {
        path: 'dashboard',
        canActivate: [agence],
        loadComponent: () =>
          import('./features/dashboard/dashboard')
            .then(m => m.DashboardComponent)
      },
      {
        path: 'actors/new',
        canActivate: [agence],
        loadComponent: () =>
          import('./features/actors/actor-form/actor-form')
            .then(m => m.ActorFormComponent)
      },
      {
        path: 'actors/:id/edit',
        canActivate: [agence],
        loadComponent: () =>
          import('./features/actors/actor-form/actor-form')
            .then(m => m.ActorFormComponent)
      },
      {
        path: 'actors/:id/gallery',
        canActivate: [agence],
        loadComponent: () =>
          import('./features/actors/gallery/actor-gallery')
            .then(m => m.ActorGalleryComponent)
      },
      {
        // ⚠️ Cette route DOIT être en dernier parmi les /actors/*
        path: 'actors/:id',
        canActivate: [agence],
        loadComponent: () =>
          import('./features/actors/detail/actor-detail')
            .then(m => m.ActorDetailComponent)
      },
      {
        path: '',
        pathMatch: 'full',
        canActivate: [homeRedirect],
        children: []
      }
    ]
  }
];
