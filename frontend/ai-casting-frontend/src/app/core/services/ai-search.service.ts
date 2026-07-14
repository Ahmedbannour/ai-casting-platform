import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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
  skills: string[];
  languages: string[];
  score: number;
  reason: string;
}

export interface SearchResponse {
  query: string;
  interpretation: string;
  totalResults: number;
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

  private readonly url = `${environment.apiUrl}/ai`;

  constructor(private http: HttpClient) {}

  search(query: string): Observable<SearchResponse> {
    return this.http.post<SearchResponse>(`${this.url}/search`, { query });
  }

  getHistory(limit = 10): Observable<HistoryItem[]> {
    return this.http.get<HistoryItem[]>(`${this.url}/history?limit=${limit}`);
  }
}
