import { Injectable } from '@angular/core';

/**
 * Manages token storage — accessToken in memory, refreshToken in localStorage.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {

  private accessToken: string | null = null;
  private readonly REFRESH_TOKEN_KEY = 'casting_refresh_token';
  private readonly ROLE_KEY = 'casting_role';

  setTokens(accessToken: string, refreshToken: string, role?: string): void {
    this.accessToken = accessToken;
    localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
    if (role) localStorage.setItem(this.ROLE_KEY, role);
  }

  setRole(role: string): void { localStorage.setItem(this.ROLE_KEY, role); }

  /** Rôle du compte connecté (ADMIN, MARQUE, AGENCE_MARKETING, REALISATEUR, BOITE_PROD, ACTEUR). Le serveur reste seul juge des droits. */
  getRole(): string | null {
    return localStorage.getItem(this.ROLE_KEY);
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
    localStorage.removeItem(this.ROLE_KEY);
  }

  hasTokens(): boolean {
    return !!this.getRefreshToken();
  }
}
