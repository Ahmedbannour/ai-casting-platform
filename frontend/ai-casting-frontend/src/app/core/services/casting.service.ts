import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type Importance = 'PRINCIPAL' | 'SECONDAIRE' | 'FIGURATION';
export type EntryStatus = 'PRESELECTIONNE' | 'AUDITION' | 'RAPPEL' | 'CHOISI' | 'REFUSE';

export interface CastingRole {
  id: string;
  projectId: string;
  projectTitle: string;
  name: string;
  description: string | null;
  /** Intention du réalisateur (cahier v2) : le point de départ des propositions d'acteurs. */
  intention: string | null;
  gender: string | null;
  minAge: number | null;
  maxAge: number | null;
  languages: string[];
  skills: string[];
  city: string | null;
  shootStart: string | null;
  shootEnd: string | null;
  importance: Importance;
  /** T-165 · Rôle de figuration : type demandé ; null = tout figurant. */
  figurationType: string | null;
  position: number;
  filled: boolean;
  shortlistCount: number;
  countByStatus: Partial<Record<EntryStatus, number>>;
  /** Texte envoyé à l'IA : critères du rôle + intention du réalisateur. */
  intentionQuery: string;
}

export interface RoleRequest {
  name: string;
  description?: string | null;
  intention?: string | null;
  gender?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  languages?: string[];
  skills?: string[];
  city?: string | null;
  shootStart?: string | null;
  shootEnd?: string | null;
  importance?: Importance;
  figurationType?: string | null;
}

export interface ShortlistEntry {
  id: string;
  roleId: string;
  actorId: string;
  firstName: string;
  lastName: string;
  age: number | null;
  city: string | null;
  gender: string | null;
  photoUrl: string | null;
  status: EntryStatus;
  note: string | null;
  auditionDate: string | null;
  createdAt: string;
  updatedAt: string;
  /** Disponibilité pour les dates de tournage : OK, A_VERIFIER, ou null si inconnue. */
  availability: 'OK' | 'A_VERIFIER' | null;
  availabilityNote: string | null;
  /** L'acteur s'est mis en pause (T-093). */
  paused?: boolean;
  /** L'acteur a un compte : il peut recevoir une proposition (T-095). */
  hasAccount?: boolean;
}

export interface Member { userId: string; name: string; email: string; owner: boolean; addedAt: string; }

export interface ActivityItem {
  at: string; userName: string; actorId: string; actorName: string;
  roleId: string; roleName: string; fromStatus: string | null; toStatus: string;
}

export const STATUSES: { value: EntryStatus; label: string }[] = [
  { value: 'PRESELECTIONNE', label: 'Présélectionnés' },
  { value: 'AUDITION', label: 'Audition' },
  { value: 'RAPPEL', label: 'Rappel' },
  { value: 'CHOISI', label: 'Choisi' },
  { value: 'REFUSE', label: 'Refusés' }
];

export const IMPORTANCES: { value: Importance; label: string }[] = [
  { value: 'PRINCIPAL', label: 'Principal' },
  { value: 'SECONDAIRE', label: 'Secondaire' },
  { value: 'FIGURATION', label: 'Figuration' }
];

export function importanceLabel(i: Importance): string {
  return IMPORTANCES.find(x => x.value === i)?.label ?? i;
}

/** Résumé lisible des critères d'un rôle : « Femme · 25–35 ans · anglais, espagnol · Paris ». */
export function criteria(r: CastingRole): string {
  const parts: string[] = [];
  if (r.gender) parts.push(r.gender);
  if (r.minAge != null && r.maxAge != null) parts.push(`${r.minAge}–${r.maxAge} ans`);
  else if (r.minAge != null) parts.push(`${r.minAge} ans et plus`);
  else if (r.maxAge != null) parts.push(`jusqu'à ${r.maxAge} ans`);
  if (r.languages.length) parts.push(r.languages.join(', ').toLowerCase());
  if (r.skills.length) parts.push(r.skills.join(', ').toLowerCase());
  if (r.city) parts.push(r.city);
  return parts.join(' · ') || 'Aucun critère précisé';
}

/** Rôles d'un projet et shortlists (MVP · sprints S4 et S5). */
@Injectable({ providedIn: 'root' })
export class CastingService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  roles(projectId: string): Observable<CastingRole[]> { return this.http.get<CastingRole[]>(`${this.api}/projects/${projectId}/roles`); }
  createRole(projectId: string, req: RoleRequest): Observable<CastingRole> { return this.http.post<CastingRole>(`${this.api}/projects/${projectId}/roles`, req); }
  reorder(projectId: string, ids: string[]): Observable<CastingRole[]> { return this.http.put<CastingRole[]>(`${this.api}/projects/${projectId}/roles/order`, ids); }
  role(id: string): Observable<CastingRole> { return this.http.get<CastingRole>(`${this.api}/roles/${id}`); }
  updateRole(id: string, req: RoleRequest): Observable<CastingRole> { return this.http.put<CastingRole>(`${this.api}/roles/${id}`, req); }
  deleteRole(id: string): Observable<void> { return this.http.delete<void>(`${this.api}/roles/${id}`); }

  shortlist(roleId: string): Observable<ShortlistEntry[]> { return this.http.get<ShortlistEntry[]>(`${this.api}/roles/${roleId}/shortlist`); }
  addToShortlist(roleId: string, actorId: string): Observable<ShortlistEntry> { return this.http.post<ShortlistEntry>(`${this.api}/roles/${roleId}/shortlist`, { actorId }); }
  updateEntry(id: string, patch: { status?: EntryStatus; note?: string; auditionDate?: string | null; replaceChosen?: boolean; clearAudition?: boolean }): Observable<ShortlistEntry> {
    return this.http.patch<ShortlistEntry>(`${this.api}/shortlist/${id}`, patch);
  }
  removeEntry(id: string): Observable<void> { return this.http.delete<void>(`${this.api}/shortlist/${id}`); }

  members(projectId: string): Observable<Member[]> { return this.http.get<Member[]>(`${this.api}/projects/${projectId}/members`); }
  addMember(projectId: string, email: string): Observable<Member> { return this.http.post<Member>(`${this.api}/projects/${projectId}/members`, { email }); }
  removeMember(projectId: string, userId: string): Observable<void> { return this.http.delete<void>(`${this.api}/projects/${projectId}/members/${userId}`); }
  activity(projectId: string, limit = 50): Observable<ActivityItem[]> { return this.http.get<ActivityItem[]>(`${this.api}/projects/${projectId}/activity?limit=${limit}`); }
}
