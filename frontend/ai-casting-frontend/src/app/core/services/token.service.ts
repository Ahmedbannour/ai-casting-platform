import { Injectable } from '@angular/core';

/**
 * Manages token storage — accessToken in memory, refreshToken in localStorage.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {

  private accessToken: string | null = null;
  private readonly REFRESH_TOKEN_KEY = 'casting_refresh_token';

  setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  clearTokens(): void {
    this.accessToken = null;
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }

  hasTokens(): boolean {
    return !!this.getRefreshToken();
  }
}
