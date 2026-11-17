import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type Vote = 'OUI' | 'PEUT_ETRE' | 'NON';

export const VOTE_LABEL: Record<Vote, string> = { OUI: 'Oui', PEUT_ETRE: 'Peut-être', NON: 'Non' };

export interface ShareRow {
  id: string; token: string; label: string | null; createdAt: string; expiresAt: string;
  active: boolean; votes: number; oui: number; peutEtre: number; non: number;
}

export interface VoteRow {
  entryId: string; vote: Vote; comment: string | null; voterName: string; updatedAt: string; shareLabel: string | null;
}

export interface PublicCandidate {
  entryId: string; firstName: string; lastName: string; age: number | null; gender: string | null; city: string | null;
  height: number | null; photoUrl: string | null; bio: string | null; languages: string[]; skills: string[];
  experiences: string[]; vote: Vote | null; comment: string | null;
}

export interface PublicShare {
  projectTitle: string; projectType: string | null; roleName: string; roleDescription: string | null; criteria: string;
  shootStart: string | null; shootEnd: string | null; label: string | null; expiresAt: string; voterName: string | null;
  candidates: PublicCandidate[];
}

/** Validation par le réalisateur : liens de partage d'un rôle et avis. */
@Injectable({ providedIn: 'root' })
export class ShareService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  list(roleId: string): Observable<ShareRow[]> { return this.http.get<ShareRow[]>(`${this.api}/roles/${roleId}/shares`); }
  create(roleId: string, label: string, days: number): Observable<ShareRow> {
    return this.http.post<ShareRow>(`${this.api}/roles/${roleId}/shares`, { label, days });
  }
  revoke(id: string): Observable<void> { return this.http.delete<void>(`${this.api}/shares/${id}`); }
  votes(roleId: string): Observable<VoteRow[]> { return this.http.get<VoteRow[]>(`${this.api}/roles/${roleId}/votes`); }

  view(token: string): Observable<PublicShare> { return this.http.get<PublicShare>(`${this.api}/public/shares/${token}`); }
  vote(token: string, entryId: string, vote: Vote, comment: string, voterName: string): Observable<void> {
    return this.http.put<void>(`${this.api}/public/shares/${token}/votes/${entryId}`, { vote, comment, voterName });
  }

  /** Adresse à envoyer au réalisateur. */
  link(token: string): string { return `${location.origin}/partage/${token}`; }
}
