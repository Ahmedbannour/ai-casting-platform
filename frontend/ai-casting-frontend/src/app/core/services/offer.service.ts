import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type OfferKind = 'PROPOSITION' | 'AUDITION';
export type OfferStatus = 'ENVOYEE' | 'ACCEPTEE' | 'DECLINEE' | 'ANNULEE';

export const OFFER_STATUS: Record<OfferStatus, string> = {
  ENVOYEE: 'En attente de réponse', ACCEPTEE: 'Acceptée', DECLINEE: 'Déclinée', ANNULEE: 'Retirée'
};
export const OFFER_KIND: Record<OfferKind, string> = { PROPOSITION: 'Proposition de rôle', AUDITION: 'Convocation à une audition' };

export interface OfferRow {
  id: string; entryId: string; kind: OfferKind; message: string | null; auditionDate: string | null;
  status: OfferStatus; createdAt: number; answeredAt: number | null; answerNote: string | null;
}

export interface MyOffer {
  id: string; kind: OfferKind; message: string | null; auditionDate: string | null; status: OfferStatus; createdAt: number;
  answerNote: string | null; projectTitle: string; projectType: string | null; roleName: string; roleDescription: string | null;
  shootStart: string | null; shootEnd: string | null; city: string | null; agencyName: string;
}

/** T-095 · Propositions de rôle et convocations. */
@Injectable({ providedIn: 'root' })
export class OfferService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  send(entryId: string, kind: OfferKind, message: string, auditionDate: string | null): Observable<OfferRow> {
    return this.http.post<OfferRow>(`${this.api}/shortlist/${entryId}/offers`, { kind, message, auditionDate });
  }
  forRole(roleId: string): Observable<OfferRow[]> { return this.http.get<OfferRow[]>(`${this.api}/roles/${roleId}/offers`); }
  cancel(id: string): Observable<void> { return this.http.delete<void>(`${this.api}/offers/${id}`); }

  mine(): Observable<MyOffer[]> { return this.http.get<MyOffer[]>(`${this.api}/me/offers`); }
  answer(id: string, answer: 'ACCEPTEE' | 'DECLINEE', note: string): Observable<void> {
    return this.http.put<void>(`${this.api}/me/offers/${id}`, { answer, note });
  }
}
