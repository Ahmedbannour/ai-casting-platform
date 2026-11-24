import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type StageState = 'complete' | 'encours' | 'vide';
export interface SheetField {
  key: string; label: string; hint: string; kind: 'TEXT' | 'LONG' | 'DATE'; required: boolean; value: string | null;
  source: 'MANUEL' | 'IA' | null; updatedBy: string | null; updatedAt: string | null; suggestion: string | null; suggestionFrom: string | null; canEdit: boolean;
}
export interface SheetStage {
  key: string; num: number; title: string; owner: string; intro: string; mine: boolean; canEdit: boolean; state: StageState;
  filled: number; total: number; fields: SheetField[]; lines: { title: string; detail: string }[]; roles: SheetRole[];
  updatedBy: string | null; updatedAt: string | null; suggestions: number;
}
export interface SheetRole { id: string; name: string; intention: string | null; gender: 'Femme' | 'Homme' | null; minAge: number | null; maxAge: number | null; }
export type RoleInput = Omit<SheetRole, 'id'>;
export interface SheetGate {
  phase: 'brief' | 'recommandation' | 'validation' | 'preparation' | 'casting' | 'fin' | 'annule'; phaseIndex: number;
  title: string; who: string; text: string; action: string | null; actionLabel: string | null; canAct: boolean;
  missing: string[]; canAskChanges: boolean; feedback: string | null; roomId: string | null;
}
export interface SheetSource {
  id: string; kind: 'FICHIER' | 'LIEN'; name: string; url: string | null; addedBy: string | null; createdAt: string;
  status: 'LECTURE' | 'FAIT' | 'ECHEC'; engine: 'IA' | 'REGLES' | null; filled: number; proposed: number; message: string | null;
}
export interface Sheet {
  requestId: string; projectId: string | null; title: string; brandName: string | null; status: string; progress: number;
  stagesDone: number; stagesTotal: number; handStage: string | null; handOwner: string | null; canUpload: boolean;
  stages: SheetStage[]; sources: SheetSource[]; gate: SheetGate; mySides: string[];
}

/** P-083 · Fiche unique du projet. */
@Injectable({ providedIn: 'root' })
export class FicheService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  forRequest(id: string): Observable<Sheet> { return this.http.get<Sheet>(`${this.api}/demandes/${id}/fiche`); }
  forRoom(projectId: string): Observable<Sheet> { return this.http.get<Sheet>(`${this.api}/rooms/${projectId}/fiche`); }
  save(id: string, key: string, value: string): Observable<Sheet> { return this.http.put<Sheet>(`${this.api}/demandes/${id}/fiche/champs/${key}`, { value }); }
  accept(id: string, key: string): Observable<Sheet> { return this.http.post<Sheet>(`${this.api}/demandes/${id}/fiche/champs/${key}/accepter`, {}); }
  propose(id: string, key: string, current: string): Observable<{ text: string | null; engine: 'IA' | 'AUCUN' }> {
    return this.http.post<{ text: string | null; engine: 'IA' | 'AUCUN' }>(`${this.api}/demandes/${id}/fiche/champs/${key}/proposer`, { value: current });
  }
  reject(id: string, key: string): Observable<Sheet> { return this.http.post<Sheet>(`${this.api}/demandes/${id}/fiche/champs/${key}/ecarter`, {}); }
  upload(id: string, file: File): Observable<Sheet> {
    const fd = new FormData(); fd.append('file', file);
    return this.http.post<Sheet>(`${this.api}/demandes/${id}/fiche/sources`, fd);
  }
  step(id: string, action: string, comment?: string): Observable<Sheet> { return this.http.post<Sheet>(`${this.api}/demandes/${id}/fiche/etapes/${action}`, { comment: comment ?? null }); }
  addRole(id: string, r: RoleInput): Observable<Sheet> { return this.http.post<Sheet>(`${this.api}/demandes/${id}/fiche/roles`, r); }
  updateRole(id: string, roleId: string, r: RoleInput): Observable<Sheet> { return this.http.put<Sheet>(`${this.api}/demandes/${id}/fiche/roles/${roleId}`, r); }
  deleteRole(id: string, roleId: string): Observable<Sheet> { return this.http.delete<Sheet>(`${this.api}/demandes/${id}/fiche/roles/${roleId}`); }
  link(id: string, url: string): Observable<Sheet> { return this.http.post<Sheet>(`${this.api}/demandes/${id}/fiche/liens`, { url }); }
}
