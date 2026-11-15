import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SkillDto { name: string; level: string; }
export interface LanguageDto { name: string; level: string; }
export interface ExperienceDto {
  title: string; production: string;
  role: string; year: number; description: string;
}
export interface AvailabilityDto { fromDate: string; toDate: string; note: string; }

export interface ActorCreateRequest {
  firstName: string; lastName: string;
  birthDate?: string; gender?: string;
  city?: string; country?: string;
  phone?: string; email?: string; bio?: string;
  height?: number; weight?: number;
  eyeColor?: string; hairColor?: string;
  skills: SkillDto[];
  languages: LanguageDto[];
  experiences: ExperienceDto[];
  availabilities: AvailabilityDto[];
}

export interface ActorSummary {
  id: string;
  firstName: string;
  lastName: string;
  city: string;
  country: string;
  gender: string;
  height: number;
  eyeColor: string;
  hairColor: string;
  age: number;           // ← ajoute
  mainPhotoUrl: string;  // ← ajoute
}

export interface ActorResponse extends ActorCreateRequest {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

/**
 * Service for actor CRUD operations.
 */
@Injectable({ providedIn: 'root' })
export class ActorService {

  private readonly apiUrl = `${environment.apiUrl}/actors`;

  constructor(private http: HttpClient) {}

  findAll(search?: string, page = 0, size = 20): Observable<PageResponse<ActorSummary>> {
    let params = new HttpParams()
      .set('page', page).set('size', size);
    if (search) params = params.set('search', search);
    return this.http.get<PageResponse<ActorSummary>>(this.apiUrl, { params });
  }

  findById(id: string): Observable<ActorResponse> {
    return this.http.get<ActorResponse>(`${this.apiUrl}/${id}`);
  }

  create(actor: ActorCreateRequest): Observable<ActorResponse> {
    return this.http.post<ActorResponse>(this.apiUrl, actor);
  }

  update(id: string, actor: Partial<ActorCreateRequest>): Observable<ActorResponse> {
    return this.http.put<ActorResponse>(`${this.apiUrl}/${id}`, actor);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  searchAdvanced(
    search?: string,
    gender?: string,
    minAge?: number,
    maxAge?: number,
    city?: string,
    page = 0,
    size = 20,
    sortBy = 'lastName',
    sortDir = 'asc'
  ): Observable<PageResponse<ActorSummary>> {
    let params = new HttpParams()
      .set('page', page)
      .set('size', size)
      .set('sortBy', sortBy)
      .set('sortDir', sortDir);
    if (search) params = params.set('search', search);
    if (gender) params = params.set('gender', gender);
    if (minAge != null) params = params.set('minAge', minAge);
    if (maxAge != null) params = params.set('maxAge', maxAge);
    if (city) params = params.set('city', city);
    return this.http.get<PageResponse<ActorSummary>>(
      `${this.apiUrl}/search`, { params });
  }
}
