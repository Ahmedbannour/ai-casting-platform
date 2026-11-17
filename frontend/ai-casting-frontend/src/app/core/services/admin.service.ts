import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UserRow {
  id: string; email: string; firstName: string; lastName: string;
  role: 'ADMIN' | 'AGENT' | 'ACTEUR'; enabled: boolean; provider: string; createdAt: string;
  agencyId: string | null; agencyName: string | null; emailVerified: boolean;
}
export interface Delta { current: number; previous: number; }
export interface Kpis {
  agenciesActive: number; agenciesTotal: number; agents: number; actors: number; freelancers: number;
  projectsActive: number; projectsTotal: number; roles: number; rolesFilled: number;
  shortlisted: number; auditions: number; chosen: number;
  newActors30: Delta; newFreelancers30: Delta; newProjects30: Delta; searches30: Delta; shortlisted30: Delta;
}
export interface MonthPoint { month: string; actorsAgence: number; actorsInscription: number; actorsImport: number; projects: number; searches: number; shortlisted: number; }
export interface Bucket { label: string; count: number; }
export interface PlatformStats {
  kpis: Kpis; monthly: MonthPoint[]; projectStatus: Bucket[]; pipeline: Bucket[];
  genders: Bucket[]; ages: Bucket[]; cities: Bucket[]; sources: Bucket[];
  freelancers: { total: number; withPhoto: number; withAvailability: number; availableNow: number; shortlistedOnce: number };
  revenue: Revenue;
  computedAt: string;
}
/** T-098 · revenu mensuel récurrent par devise et contrats à renouveler sous 30 jours. */
export interface Revenue {
  mrr: { currency: string; amount: number }[]; payingAgencies: number; activeWithoutAmount: number;
  renewals: { id: string; name: string; contractEnd: string; daysLeft: number; monthlyAmount: number | null; currency: string }[];
}
export type Plan = 'ESSENTIEL' | 'PRO' | 'STUDIO' | 'SUR_MESURE';
export interface AgencyStats {
  id: string; name: string; city: string | null; contactEmail: string | null; contractStart: string; contractEnd: string | null;
  maxAgents: number | null; status: 'ACTIF' | 'A_VENIR' | 'EXPIRE'; agents: number; projects: number; activeProjects: number;
  roles: number; rolesFilled: number; candidates: number; searches30: number; lastActivity: string | null;
  plan: Plan | null; monthlyAmount: number | null; currency: string;
}
export interface AgencyRequest {
  name: string; city: string | null; contactEmail: string | null; contractStart: string; contractEnd: string | null; maxAgents: number | null; notes: string | null;
  plan: Plan | '' | null; monthlyAmount: number | null; currency: string;
}
export interface AuditEntry { id: string; actor: string; action: string; target: string | null; details: string | null; createdAt: number; }
export interface ProjectStats {
  id: string; title: string; type: string; status: string; startDate: string | null; endDate: string | null; createdAt: string;
  owner: string; agency: string | null; roles: number; rolesFilled: number; candidates: number; auditions: number; chosen: number; lastActivity: string | null;
}
export interface Overview {
  agents: number; admins: number; actorAccounts: number; actors: number;
  actorsAgence: number; actorsInscription: number; actorsImport: number;
}
export interface ImportColumn { header: string; field: string | null; label: string | null; }
export interface ImportRow { line: number; status: 'OK' | 'ERREUR' | 'DOUBLON'; errors: string[]; warnings: string[]; data: any; }
export interface ImportPreview {
  fileName: string; totalRows: number; columns: ImportColumn[]; rows: ImportRow[];
  ok: number; errors: number; duplicates: number; warnings: number;
}
export interface ImportResult { created: number; skipped: { index: number; reason: string }[]; }

/** Administration de l'agence : comptes et import d'acteurs. */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/admin`;

  overview(): Observable<Overview> { return this.http.get<Overview>(`${this.url}/overview`); }
  users(role?: string, q?: string): Observable<UserRow[]> {
    let params = new HttpParams();
    if (role) params = params.set('role', role);
    if (q) params = params.set('q', q);
    return this.http.get<UserRow[]>(`${this.url}/users`, { params });
  }
  stats(months = 12): Observable<PlatformStats> { return this.http.get<PlatformStats>(`${this.url}/stats`, { params: { months } }); }
  agencies(): Observable<AgencyStats[]> { return this.http.get<AgencyStats[]>(`${this.url}/agencies`); }
  createAgency(body: AgencyRequest): Observable<AgencyStats> { return this.http.post<AgencyStats>(`${this.url}/agencies`, body); }
  updateAgency(id: string, body: AgencyRequest): Observable<AgencyStats> { return this.http.put<AgencyStats>(`${this.url}/agencies/${id}`, body); }
  /** T-099 · journal d'audit de l'administration. */
  audit(action?: string): Observable<AuditEntry[]> {
    return this.http.get<AuditEntry[]>(`${this.url}/audit`, { params: action ? { action } : {} });
  }

  projects(status?: string): Observable<ProjectStats[]> {
    return this.http.get<ProjectStats[]>(`${this.url}/projects`, { params: status ? { status } : {} });
  }

  createAgent(body: { email: string; firstName: string; lastName: string; role: string; agencyId: string | null }): Observable<{ user: UserRow; temporaryPassword: string | null }> {
    return this.http.post<{ user: UserRow; temporaryPassword: string | null }>(`${this.url}/agents`, body);
  }
  updateUser(id: string, patch: { enabled?: boolean; role?: string; agencyId?: string }): Observable<UserRow> {
    return this.http.patch<UserRow>(`${this.url}/users/${id}`, patch);
  }
  preview(file: File): Observable<ImportPreview> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ImportPreview>(`${this.url}/import/actors/preview`, fd);
  }
  importRows(rows: any[]): Observable<ImportResult> { return this.http.post<ImportResult>(`${this.url}/import/actors`, { rows }); }
}
