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
