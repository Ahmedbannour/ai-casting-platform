import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type ProjectType = 'LONG_METRAGE' | 'SERIE' | 'COURT_METRAGE' | 'PUBLICITE' | 'THEATRE' | 'AUTRE';
export type ProjectStatus = 'EN_COURS' | 'TERMINE' | 'ARCHIVE';

export interface Project {
  id: string;
  title: string;
  type: ProjectType;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: ProjectStatus;
  ownerName: string;
  owner: boolean;
  rolesCount: number;
  rolesFilled: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRequest {
  title: string;
  type: ProjectType;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: 'LONG_METRAGE', label: 'Long métrage' },
  { value: 'SERIE', label: 'Série' },
  { value: 'COURT_METRAGE', label: 'Court métrage' },
  { value: 'PUBLICITE', label: 'Publicité' },
  { value: 'THEATRE', label: 'Théâtre' },
  { value: 'AUTRE', label: 'Autre' }
];

export function typeLabel(t: ProjectType): string {
  return PROJECT_TYPES.find(x => x.value === t)?.label ?? t;
}

/** Projets de casting (MVP · sprint S3). */
@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/projects`;

  list(status?: ProjectStatus): Observable<Project[]> {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return this.http.get<Project[]>(this.url, { params });
  }
  get(id: string): Observable<Project> { return this.http.get<Project>(`${this.url}/${id}`); }
  create(req: ProjectRequest): Observable<Project> { return this.http.post<Project>(this.url, req); }
  update(id: string, req: ProjectRequest): Observable<Project> { return this.http.put<Project>(`${this.url}/${id}`, req); }
  archive(id: string): Observable<Project> { return this.http.post<Project>(`${this.url}/${id}/archive`, {}); }
  restore(id: string): Observable<Project> { return this.http.post<Project>(`${this.url}/${id}/restore`, {}); }
  finish(id: string): Observable<Project> { return this.http.post<Project>(`${this.url}/${id}/finish`, {}); }
  delete(id: string): Observable<void> { return this.http.delete<void>(`${this.url}/${id}`); }
}
