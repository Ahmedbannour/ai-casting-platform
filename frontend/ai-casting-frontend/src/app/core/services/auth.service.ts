import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenService } from './token.service';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** T-101 · accord aux conditions et à la politique de confidentialité. */
  acceptTerms?: boolean;
  age?: 'MAJEUR' | 'MINEUR';
  guardianName?: string;
}

/**
 * Handles authentication API calls and session state.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {

  private readonly apiUrl = `${environment.apiUrl}/auth`;

  constructor(
    private http: HttpClient,
    private tokenService: TokenService,
    private router: Router
  ) {}

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, request).pipe(
      tap(response => this.tokenService.setTokens(response.accessToken, response.refreshToken, response.role))
    );
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, request).pipe(
      tap(response => this.tokenService.setTokens(response.accessToken, response.refreshToken, response.role))
    );
  }

  refresh(): Observable<AuthResponse> {
    const refreshToken = this.tokenService.getRefreshToken();
    return this.http.post<AuthResponse>(`${this.apiUrl}/refresh`, { refreshToken }).pipe(
      tap(response => this.tokenService.setTokens(response.accessToken, response.refreshToken, response.role))
    );
  }

  logout(): void {
    this.http.post(`${this.apiUrl}/logout`, {}).subscribe();
    this.tokenService.clearTokens();
    this.router.navigate(['/auth/login']);
  }

  isAuthenticated(): boolean {
    return this.tokenService.hasTokens();
  }

  role(): string | null { return this.tokenService.getRole(); }

  /** Page d'accueil selon le rôle : l'acteur freelance arrive sur son profil, l'agence sur la recherche. */
  homeFor(role: string | null = this.role()): string {
    return role === 'ACTEUR' ? '/mon-espace' : '/accueil';
  }

  /** Fournisseurs de connexion configurés côté serveur (identifiants publics). */
  providers(): Observable<{ google: string | null; facebook: string | null }> {
    return this.http.get<{ google: string | null; facebook: string | null }>(`${this.apiUrl}/providers`);
  }

  loginWith(provider: 'google' | 'facebook', token: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/${provider}`, { token }).pipe(
      tap(response => this.tokenService.setTokens(response.accessToken, response.refreshToken, response.role))
    );
  }
}
