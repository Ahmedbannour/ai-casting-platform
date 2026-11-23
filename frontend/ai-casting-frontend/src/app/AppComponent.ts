import { Component, NgZone, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ToastHostComponent } from './shared/components/toast-host/toast-host';

/**
 * Composant racine. La session est restaurée avant le démarrage
 * par provideAppInitializer (voir app.config.ts).
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastHostComponent],
  template: `<router-outlet /><app-toast-host />`
})
export class AppComponent {
  /** La lampe du fond suit doucement la souris (désactivée si l'utilisateur limite les animations). */
  constructor() {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;

    // Entrée en cascade des blocs : uniquement juste après une navigation, puis la classe est retirée.
    let navTimer: ReturnType<typeof setTimeout> | undefined;
    inject(Router).events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      root.classList.add('nav-enter');
      clearTimeout(navTimer);
      navTimer = setTimeout(() => root.classList.remove('nav-enter'), 1000);
    });
    let frame = 0, x = 50, y = 35;
    inject(NgZone).runOutsideAngular(() => {
      window.addEventListener('pointermove', (e: PointerEvent) => {
        x = (e.clientX / window.innerWidth) * 100;
        y = (e.clientY / window.innerHeight) * 100;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          root.style.setProperty('--mx', x.toFixed(1) + '%');
          root.style.setProperty('--my', y.toFixed(1) + '%');
          frame = 0;
        });
      }, { passive: true });
    });
  }
}
