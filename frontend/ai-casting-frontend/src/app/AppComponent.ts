import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { TokenService } from './core/services/token.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`
})
export class AppComponent implements OnInit {

  constructor(
    private authService: AuthService,
    private tokenService: TokenService
  ) {}

  ngOnInit(): void {
    if (this.tokenService.getRefreshToken() && !this.tokenService.getAccessToken()) {
      this.authService.refresh().subscribe({
        error: () => this.authService.logout()
      });
    }
  }
}
