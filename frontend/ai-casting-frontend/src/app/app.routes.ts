import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { MainLayoutComponent } from './layout/main-layout/main-layout';

export const routes: Routes = [
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./features/auth/login/login.component')
        .then(m => m.LoginComponent)
  },
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'chat',
        loadComponent: () =>
          import('./features/chat/chat')
            .then(m => m.ChatComponent)
      },
      {
        path: 'projects',
        loadComponent: () =>
          import('./features/projects/projects')
            .then(m => m.ProjectsComponent)
      },
      {
        path: 'projects/:id',
        loadComponent: () =>
          import('./features/projects/project-detail')
            .then(m => m.ProjectDetailComponent)
      },
      {
        path: 'roles/:id',
        loadComponent: () =>
          import('./features/projects/role-detail')
            .then(m => m.RoleDetailComponent)
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard')
            .then(m => m.DashboardComponent)
      },
      {
        path: 'actors/new',
        loadComponent: () =>
          import('./features/actors/actor-form/actor-form')
            .then(m => m.ActorFormComponent)
      },
      {
        path: 'actors/:id/edit',
        loadComponent: () =>
          import('./features/actors/actor-form/actor-form')
            .then(m => m.ActorFormComponent)
      },
      {
        path: 'actors/:id/gallery',
        loadComponent: () =>
          import('./features/actors/gallery/actor-gallery')
            .then(m => m.ActorGalleryComponent)
      },
      {
        // ⚠️ Cette route DOIT être en dernier parmi les /actors/*
        path: 'actors/:id',
        loadComponent: () =>
          import('./features/actors/detail/actor-detail')
            .then(m => m.ActorDetailComponent)
      },
      {
        path: '',
        redirectTo: 'chat',
        pathMatch: 'full'
      }
    ]
  }
];
