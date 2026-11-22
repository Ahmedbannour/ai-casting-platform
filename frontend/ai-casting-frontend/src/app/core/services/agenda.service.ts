import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AgendaItem {
  entryId: string; date: string; time: string | null; place: string | null; pending: boolean;
  actorId: string; actorName: string; roleId: string; roleName: string; projectId: string; projectTitle: string;
  agencyName: string; status: 'AUDITION' | 'RAPPEL' | 'EN_ATTENTE';
}

/** T-116 · Agenda des auditions (agent : ses projets ; acteur : ses auditions). */
@Injectable({ providedIn: 'root' })
export class AgendaService {
  private readonly http = inject(HttpClient);
  list(from: string, to: string): Observable<AgendaItem[]> {
    return this.http.get<AgendaItem[]>(`${environment.apiUrl}/me/agenda`, { params: new HttpParams().set('from', from).set('to', to) });
  }
  /** Flux d'agenda personnel (jeton secret) pour Google Agenda et Outlook. */
  feed(): Observable<{ token: string }> { return this.http.get<{ token: string }>(`${environment.apiUrl}/me/agenda/flux`); }
  renewFeed(): Observable<{ token: string }> { return this.http.post<{ token: string }>(`${environment.apiUrl}/me/agenda/flux`, {}); }
}
