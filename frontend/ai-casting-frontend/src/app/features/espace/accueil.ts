import { Component, computed, inject } from '@angular/core';
import { MeService } from '../../core/services/me.service';
import { AuthService } from '../../core/services/auth.service';
import { AgentHomeComponent } from './agent-home';
import { AdminHomeComponent } from './admin-home';

/** /accueil : l'administrateur voit l'accueil de la plateforme, l'agent celui de son agence. */
@Component({
  selector: 'app-accueil',
  standalone: true,
  imports: [AgentHomeComponent, AdminHomeComponent],
  template: `@if (isAdmin()) { <app-admin-home /> } @else { <app-agent-home /> }`
})
export class AccueilComponent {
  private readonly me = inject(MeService);
  private readonly auth = inject(AuthService);
  readonly isAdmin = computed(() => (this.me.me()?.role ?? this.auth.role()) === 'ADMIN');
}
