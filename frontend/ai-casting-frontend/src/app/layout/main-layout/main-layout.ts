import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  styles: [`
    :host {
      display: flex;
      height: 100vh;
      width: 100%;
      overflow: hidden;
    }
    .content {
      flex: 1;
      height: 100vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      view-transition-name: page;  /* zone animée lors du changement de page */
    }
  `],
  template: `
    <app-sidebar />
    <div class="content">
      <router-outlet />
    </div>
  `
})
export class MainLayoutComponent {}
