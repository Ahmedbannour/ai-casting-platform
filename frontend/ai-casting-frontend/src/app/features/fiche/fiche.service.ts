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
  filled: number; total: number; fields: SheetField[]; lines: { title: string; detail: string }[]; updatedBy: string | null; updatedAt: string | null; suggestions: number;
}
export interface SheetSource {
  id: string; kind: 'FICHIER' | 'LIEN'; name: string; url: string | null; addedBy: string | null; createdAt: string;
  status: 'LECTURE' | 'FAIT' | 'ECHEC'; engine: 'IA' | 'REGLES' | null; filled: number; proposed: number; message: string | null;
}
export interface Sheet {
  requestId: string; projectId: string | null; title: string; brandName: string | null; status: string; progress: number;
  stagesDone: number; stagesTotal: number; handStage: string | null; handOwner: string | null; canUpload: boolean;
  stages: SheetStage[]; sources: SheetSource[];
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
  reject(id: string, key: string): Observable<Sheet> { return this.http.post<Sheet>(`${this.api}/demandes/${id}/fiche/champs/${key}/ecarter`, {}); }
  upload(id: string, file: File): Observable<Sheet> {
    const fd = new FormData(); fd.append('file', file);
    return this.http.post<Sheet>(`${this.api}/demandes/${id}/fiche/sources`, fd);
  }
  link(id: string, url: string): Observable<Sheet> { return this.http.post<Sheet>(`${this.api}/demandes/${id}/fiche/liens`, { url }); }
}
