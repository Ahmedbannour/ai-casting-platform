import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Composant racine. La session est restaurée avant le démarrage
 * par provideAppInitializer (voir app.config.ts).
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`
})
export class AppComponent {}
