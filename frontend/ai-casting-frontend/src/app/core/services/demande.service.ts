import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Cahier v2 · étapes d'une demande de publicité, dans l'ordre du cycle. */
export type DemandeStatus = 'BROUILLON' | 'V0_ENVOYEE' | 'V1_EN_COURS' | 'V1_LIVREE' | 'V2_EN_COURS' | 'V2_LIVREE'
  | 'CASTING' | 'PPM' | 'ACTEURS_VALIDES' | 'CLOTUREE' | 'ANNULEE';

export const STATUS_LABEL: Record<DemandeStatus, string> = {
  BROUILLON: 'Brouillon', V0_ENVOYEE: 'V0 envoyée à l’agence', V1_EN_COURS: 'V1 en cours', V1_LIVREE: 'V1 livrée',
  V2_EN_COURS: 'V2 en cours', V2_LIVREE: 'V2 livrée', CASTING: 'Casting', PPM: 'PPM', ACTEURS_VALIDES: 'Acteurs validés',
  CLOTUREE: 'Clôturée', ANNULEE: 'Annulée'
};

export interface DemandeSummary {
  id: string; title: string; product: string | null; status: DemandeStatus; brandName: string; agencyName: string | null;
  airDate: string | null; updatedAt: string; hasV0: boolean;
}
export interface DemandeVersion {
  id: string; kind: 'V0' | 'V1' | 'V2'; label: string; status: 'BROUILLON' | 'LIVREE' | 'A_REVISER'; body: string | null;
  fileName: string | null; fileType: string | null; fileSize: number | null; authorName: string | null; createdAt: string; deliveredAt: string | null; reviewComment: string | null; reviewedAt: string | null; linkUrl: string | null;
}
export interface DemandeAnalysis { summary: string; missing: string[]; questions: string[]; source: 'IA' | 'REGLES'; at: string; }
export interface DemandeCharacter { id: string; name: string; story: string | null; brandWish: string | null; agencyWish: string | null; notes: string | null; }
export interface CharacterRequest { name: string; story?: string | null; brandWish?: string | null; agencyWish?: string | null; notes?: string | null; }
export interface PersonOption { id: string; name: string; organisation: string | null; }
export interface DemandeScene { id: string; title: string; description: string | null; }
export type Importance = 'PRINCIPAL' | 'SECONDAIRE' | 'FIGURATION';
export interface RoleSheet { id: string; characterId: string | null; characterName: string | null; name: string; intention: string | null; gender: string | null;
  minAge: number | null; maxAge: number | null; appearance: string | null; importance: Importance; castingRoleId: string | null; }
export interface RoleSheetRequest { characterId: string | null; name: string; intention: string | null; gender: string | null; minAge: number | null; maxAge: number | null; appearance: string | null; importance: Importance; }
export interface DemandeEvent { type: string; message: string; actorName: string | null; createdAt: string; }
export interface DemandeDetail {
  id: string; title: string; product: string | null; objective: string | null; target: string | null; keyMessage: string | null;
  airDate: string | null; status: DemandeStatus; brandName: string; agencyId: string | null; agencyName: string | null; createdByName: string;
  createdAt: string; updatedAt: string; canEdit: boolean; canRespond: boolean; canAnalyse: boolean; analysis: DemandeAnalysis | null;
  canEditV1: boolean; canReviewV1: boolean; canChooseProduction: boolean; v1Validated: boolean; productionName: string | null;
  canEditExpectations: boolean; characters: DemandeCharacter[]; directorName: string | null; firstAdName: string | null; expectationsSentAt: string | null;
  canEditV2: boolean; scenes: DemandeScene[]; roles: RoleSheet[]; projectId: string | null; v2PublishedAt: string | null; versions: DemandeVersion[]; events: DemandeEvent[];
}
export interface DemandeRequest { title: string; product?: string | null; objective?: string | null; target?: string | null; keyMessage?: string | null; airDate?: string | null; }
export interface AgencyOption { id: string; name: string; city: string | null; }

@Injectable({ providedIn: 'root' })
export class DemandeService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/demandes`;

  mine(): Observable<DemandeSummary[]> { return this.http.get<DemandeSummary[]>(this.url); }
  get(id: string): Observable<DemandeDetail> { return this.http.get<DemandeDetail>(`${this.url}/${id}`); }
  agencies(): Observable<AgencyOption[]> { return this.http.get<AgencyOption[]>(`${this.url}/agences`); }
  create(body: DemandeRequest): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(this.url, body); }
  update(id: string, body: DemandeRequest): Observable<DemandeDetail> { return this.http.put<DemandeDetail>(`${this.url}/${id}`, body); }
  remove(id: string): Observable<void> { return this.http.delete<void>(`${this.url}/${id}`); }
  saveV0(id: string, body: string, link: string | null = null): Observable<DemandeDetail> { return this.http.put<DemandeDetail>(`${this.url}/${id}/v0`, { body, link }); }
  uploadV0(id: string, file: File): Observable<DemandeDetail> {
    const f = new FormData(); f.append('file', file);
    return this.http.post<DemandeDetail>(`${this.url}/${id}/v0/fichier`, f);
  }
  removeV0File(id: string): Observable<DemandeDetail> { return this.http.delete<DemandeDetail>(`${this.url}/${id}/v0/fichier`); }
  send(id: string, agencyId: string): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/envoyer`, { agencyId }); }
  cancel(id: string): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/annuler`, {}); }
  accept(id: string): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/accepter`, {}); }
  refuse(id: string, reason: string): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/refuser`, { reason }); }
  analyse(id: string): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/analyse`, {}); }
  saveV1(id: string, body: string, link: string | null = null): Observable<DemandeDetail> { return this.http.put<DemandeDetail>(`${this.url}/${id}/v1`, { body, link }); }
  uploadV1(id: string, file: File): Observable<DemandeDetail> { const f = new FormData(); f.append('file', file); return this.http.post<DemandeDetail>(`${this.url}/${id}/v1/fichier`, f); }
  removeV1File(id: string): Observable<DemandeDetail> { return this.http.delete<DemandeDetail>(`${this.url}/${id}/v1/fichier`); }
  deliverV1(id: string): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/v1/livrer`, {}); }
  reviseV1(id: string, comment: string): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/v1/revision`, { comment }); }
  validateV1(id: string): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/v1/valider`, {}); }
  productions(): Observable<AgencyOption[]> { return this.http.get<AgencyOption[]>(`${this.url}/productions`); }
  chooseProduction(id: string, productionId: string): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/production`, { productionId }); }
  addCharacter(id: string, c: CharacterRequest): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/personnages`, c); }
  updateCharacter(id: string, cid: string, c: CharacterRequest): Observable<DemandeDetail> { return this.http.put<DemandeDetail>(`${this.url}/${id}/personnages/${cid}`, c); }
  deleteCharacter(id: string, cid: string): Observable<DemandeDetail> { return this.http.delete<DemandeDetail>(`${this.url}/${id}/personnages/${cid}`); }
  directors(): Observable<PersonOption[]> { return this.http.get<PersonOption[]>(`${this.url}/realisateurs`); }
  transmit(id: string, directorId: string, firstAdId: string | null): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/transmettre`, { directorId, firstAdId }); }
  saveV2(id: string, body: string, link: string | null = null): Observable<DemandeDetail> { return this.http.put<DemandeDetail>(`${this.url}/${id}/v2`, { body, link }); }
  uploadV2(id: string, file: File): Observable<DemandeDetail> { const f = new FormData(); f.append('file', file); return this.http.post<DemandeDetail>(`${this.url}/${id}/v2/fichier`, f); }
  removeV2File(id: string): Observable<DemandeDetail> { return this.http.delete<DemandeDetail>(`${this.url}/${id}/v2/fichier`); }
  addScene(id: string, b: { title: string; description: string | null }): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/scenes`, b); }
  updateScene(id: string, sid: string, b: { title: string; description: string | null }): Observable<DemandeDetail> { return this.http.put<DemandeDetail>(`${this.url}/${id}/scenes/${sid}`, b); }
  deleteScene(id: string, sid: string): Observable<DemandeDetail> { return this.http.delete<DemandeDetail>(`${this.url}/${id}/scenes/${sid}`); }
  addRole(id: string, b: RoleSheetRequest): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/roles`, b); }
  updateRole(id: string, rid: string, b: RoleSheetRequest): Observable<DemandeDetail> { return this.http.put<DemandeDetail>(`${this.url}/${id}/roles/${rid}`, b); }
  deleteRole(id: string, rid: string): Observable<DemandeDetail> { return this.http.delete<DemandeDetail>(`${this.url}/${id}/roles/${rid}`); }
  publishV2(id: string): Observable<DemandeDetail> { return this.http.post<DemandeDetail>(`${this.url}/${id}/v2/publier`, {}); }
  file(id: string, versionId: string): Observable<Blob> { return this.http.get(`${this.url}/${id}/versions/${versionId}/fichier`, { responseType: 'blob' }); }
}
