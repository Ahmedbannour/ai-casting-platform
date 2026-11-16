import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ActorSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  city: string;
  country: string;
  gender: string;
  age: number;
  mainPhotoUrl: string;
  photoUrls?: string[];
  skills: string[];
  languages: string[];
  score: number;
  reason: string;
}

export interface SearchResponse {
  query: string;
  interpretation: string;
  totalResults: number;
  page: number;
  size: number;
  hasMore: boolean;
  results: ActorSearchResult[];
}

export interface HistoryItem {
  id: string;
  query: string;
  resultsCount: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class AiSearchAngularService {

  /** Émis après chaque nouvelle recherche : le menu recharge l'historique. */
  readonly historyChanged = new Subject<void>();

  private readonly url = `${environment.apiUrl}/ai`;

  constructor(private http: HttpClient) {}

  search(query: string, page = 0, size = 10): Observable<SearchResponse> {
    return this.http.post<SearchResponse>(`${this.url}/search`, { query, page, size });
  }

  /** Analyse de l'IA pour les meilleurs profils, demandée après l'affichage des résultats. */
  explain(query: string, actorIds: string[]): Observable<Record<string, string>> {
    return this.http.post<Record<string, string>>(`${this.url}/explain`, { query, actorIds });
  }

  /** Décision du client sur une proposition : RETENU, ECARTE ou ANNULE. */
  feedback(query: string, actorId: string, decision: 'RETENU' | 'ECARTE' | 'ANNULE'): Observable<void> {
    return this.http.post<void>(`${this.url}/feedback`, { query, actorId, decision });
  }

  getHistory(limit = 10): Observable<HistoryItem[]> {
    return this.http.get<HistoryItem[]>(`${this.url}/history?limit=${limit}`);
  }
}
