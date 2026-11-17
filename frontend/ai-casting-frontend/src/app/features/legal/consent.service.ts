import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, map, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenService } from '../../core/services/token.service';

export interface ConsentStatus { version: string; required: boolean; acceptedAt: number | null; }
export interface ConsentRequest { accept: boolean; age: 'MAJEUR' | 'MINEUR'; guardianName?: string; }

/** T-101 · Accord aux conditions d'utilisation et à la politique de confidentialité (version en vigueur). */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/me/consent`;
  private readonly tokens = inject(TokenService);
  /** Session (jeton de renouvellement) pour laquelle l'accord est déjà vérifié : un autre compte revérifie. */
  private okFor: string | null = null;
  private get ok(): boolean { return !!this.okFor && this.okFor === this.tokens.getRefreshToken(); }
  private set ok(v: boolean) { this.okFor = v ? this.tokens.getRefreshToken() : null; }

  /** true si l'utilisateur connecté doit encore donner son accord. En cas d'erreur réseau, on ne bloque pas. */
  required(): Observable<boolean> {
    if (this.ok) return of(false);
    return this.http.get<ConsentStatus>(this.url).pipe(
      tap(s => this.ok = !s.required), map(s => s.required), catchError(() => of(false)));
  }

  accept(r: ConsentRequest): Observable<ConsentStatus> {
    return this.http.post<ConsentStatus>(this.url, r).pipe(tap(s => this.ok = !s.required));
  }

  reset(): void { this.ok = false; }
}
