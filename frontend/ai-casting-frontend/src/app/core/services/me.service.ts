import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ActorResponse } from './actor.service';
import { PhotoResponse, PhotoUploadResponse } from './photo.service';
import { TokenService } from './token.service';
import { Brand, BrandService } from './brand.service';

export interface Me {
  id: string; email: string; firstName: string; lastName: string;
  role: 'ADMIN' | 'BOITE_PROD' | 'ASSISTANT_PROD' | 'ACTEUR' | 'MARQUE' | 'AGENCE_MARKETING' | 'REALISATEUR'; provider: string; actorId: string | null;
  agencyName: string | null; contractStatus: 'ACTIF' | 'A_VENIR' | 'EXPIRE' | 'SANS_AGENCE' | null; contractEnd: string | null;
  /** Ce que le compte peut faire côté production (tout pour le producer ; ce qu'il autorise pour l'assistante). */
  perms: string[];
  /** Image de marque de sa boîte de production (null : couleurs Cercle). */
  brand: Brand | null;
}

/** Compte connecté et espace personnel de l'acteur freelance. */
export interface Visibility { visibility: 'VISIBLE' | 'PAUSE'; changedAt: string | null; }

@Injectable({ providedIn: 'root' })
export class MeService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/me`;
  private readonly tokens = inject(TokenService);
  private readonly brand = inject(BrandService);

  readonly me = signal<Me | null>(null);

  /** Autorisation côté production : le producer peut tout, l'assistante ce que le producer lui ouvre. */
  can(perm: string): boolean { return !!this.me()?.perms?.includes(perm); }

  load(): Observable<Me> {
    return this.http.get<Me>(this.url).pipe(tap(m => { this.me.set(m); this.tokens.setRole(m.role); this.brand.setOwn(m.brand ?? null); }));
  }

  actor(): Observable<ActorResponse> { return this.http.get<ActorResponse>(`${this.url}/actor`); }
  updateActor(body: unknown): Observable<ActorResponse> { return this.http.put<ActorResponse>(`${this.url}/actor`, body); }

  photos(): Observable<PhotoResponse[]> { return this.http.get<PhotoResponse[]>(`${this.url}/photos`); }
  upload(files: File[]): Observable<PhotoUploadResponse> {
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    return this.http.post<PhotoUploadResponse>(`${this.url}/photos`, fd);
  }
  setMain(photoId: string): Observable<PhotoResponse> { return this.http.put<PhotoResponse>(`${this.url}/photos/${photoId}/main`, {}); }
  deletePhoto(photoId: string): Observable<void> { return this.http.delete<void>(`${this.url}/photos/${photoId}`); }

  /** Qui a consulté mes coordonnées (T-094). */
  contactViews(): Observable<{ who: string; viewedAt: number }[]> {
    return this.http.get<{ who: string; viewedAt: number }[]>(`${this.url}/contact-views`);
  }

  /** Consentement de l'acteur : visible des agences ou en pause. */
  visibility(): Observable<Visibility> { return this.http.get<Visibility>(`${this.url}/visibility`); }
  setVisibility(visibility: 'VISIBLE' | 'PAUSE'): Observable<Visibility> {
    return this.http.put<Visibility>(`${this.url}/visibility`, { visibility });
  }
}
