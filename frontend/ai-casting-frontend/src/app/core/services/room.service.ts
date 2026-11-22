import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Room de casting d'un projet : équipe, swipe, résultats, documents partagés, tâches. */
export interface RoomPerms { lead: boolean; swipe: boolean; results: boolean; docs: boolean; tasks: boolean; }
export interface RoomMember { userId: string; name: string; role: string; organisation: string | null; owner: boolean; perms: RoomPerms; }
export interface RoomRole { id: string; name: string; importance: string | null; intention: string | null; candidates: number; toSwipe: number; matches: number; }
export interface Room { id: string; title: string; type: string; status: string; description: string | null; me: RoomPerms; myId: string;
  members: RoomMember[]; roles: RoomRole[]; tasksOpen: number; documents: number;
  /** Image de marque de la boîte de production qui dirige la room (null : couleurs Cercle). */
  brand: import('./brand.service').Brand | null; }
export interface RoomItem { id: string; title: string; type: string; status: string; roles: number; toSwipe: number; lead: boolean; }
export interface SwipeCard { entryId: string; actorId: string; name: string; age: number | null; city: string | null; gender: string | null;
  height: number | null; photoUrl: string | null; bio: string | null; languages: string[]; skills: string[]; note: string | null; }
export type Vote = 'NON' | 'OUI' | 'COEUR';
export interface VoteResult { vote: Vote; match: boolean; newMatch: boolean; actorName: string; left: number; }
export interface SideVote { role: string; name: string; vote: Vote; }
export interface ResultRow { entryId: string; actorId: string; name: string; age: number | null; city: string | null; photoUrl: string | null;
  coeurs: number; oui: number; non: number; voters: number; match: boolean; rank: number | null; myVote: Vote | null; votes: SideVote[]; }
export interface RoomDoc { id: string; name: string; fileType: string | null; fileSize: number | null; audience: string[]; version: number;
  uploadedBy: string | null; updatedAt: string; canEdit: boolean; }
export type TaskStatus = 'A_FAIRE' | 'EN_COURS' | 'FAIT';
export interface RoomTask { id: string; title: string; assigneeId: string | null; assigneeName: string | null; dueDate: string | null;
  status: TaskStatus; position: number; canEdit: boolean; canMove: boolean; }

export const SIDE_LABEL: Record<string, string> = { MARQUE: 'Marque', AGENCE_MARKETING: 'Agence', REALISATEUR: 'Réalisateur', BOITE_PROD: 'Production', ASSISTANT_PROD: 'Assistante de production', ADMIN: 'Admin' };

@Injectable({ providedIn: 'root' })
export class RoomService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/rooms`;

  mine(): Observable<RoomItem[]> { return this.http.get<RoomItem[]>(this.url); }
  get(id: string): Observable<Room> { return this.http.get<Room>(`${this.url}/${id}`); }

  /** Compte inscrit : il entre dans la room ; sinon ROLE (préciser son rôle) puis LIEN (lien d'invitation à envoyer). */
  inviteByEmail(id: string, email: string, kind?: string): Observable<{ status: 'RATTACHE' | 'ROLE' | 'LIEN'; token: string | null; message: string }> {
    return this.http.post<{ status: 'RATTACHE' | 'ROLE' | 'LIEN'; token: string | null; message: string }>(`${this.url}/${id}/invitations`, { email, kind });
  }
  invite(id: string, email: string): Observable<Room> { return this.http.post<Room>(`${this.url}/${id}/membres`, { email }); }
  setPerms(id: string, userId: string, p: Partial<RoomPerms>): Observable<Room> { return this.http.put<Room>(`${this.url}/${id}/membres/${userId}`, p); }
  removeMember(id: string, userId: string): Observable<Room> { return this.http.delete<Room>(`${this.url}/${id}/membres/${userId}`); }

  deck(id: string, roleId: string): Observable<SwipeCard[]> { return this.http.get<SwipeCard[]>(`${this.url}/${id}/roles/${roleId}/swipe`); }
  vote(id: string, entryId: string, vote: Vote): Observable<VoteResult> { return this.http.put<VoteResult>(`${this.url}/${id}/votes/${entryId}`, { vote }); }
  unvote(id: string, entryId: string): Observable<void> { return this.http.delete<void>(`${this.url}/${id}/votes/${entryId}`); }
  results(id: string, roleId: string): Observable<ResultRow[]> { return this.http.get<ResultRow[]>(`${this.url}/${id}/roles/${roleId}/resultats`); }
  rank(id: string, entryId: string, rank: number | null): Observable<ResultRow[]> { return this.http.put<ResultRow[]>(`${this.url}/${id}/choix/${entryId}`, { rank }); }

  documents(id: string): Observable<RoomDoc[]> { return this.http.get<RoomDoc[]>(`${this.url}/${id}/documents`); }
  upload(id: string, file: File, audience: string[]): Observable<RoomDoc[]> {
    const f = new FormData(); f.append('file', file); audience.forEach(a => f.append('audience', a));
    return this.http.post<RoomDoc[]>(`${this.url}/${id}/documents`, f);
  }
  replace(id: string, docId: string, file: File): Observable<RoomDoc[]> {
    const f = new FormData(); f.append('file', file);
    return this.http.post<RoomDoc[]>(`${this.url}/${id}/documents/${docId}/version`, f);
  }
  setAudience(id: string, docId: string, audience: string[]): Observable<RoomDoc[]> { return this.http.put<RoomDoc[]>(`${this.url}/${id}/documents/${docId}/audience`, { audience }); }
  deleteDoc(id: string, docId: string): Observable<RoomDoc[]> { return this.http.delete<RoomDoc[]>(`${this.url}/${id}/documents/${docId}`); }
  file(id: string, docId: string): Observable<Blob> { return this.http.get(`${this.url}/${id}/documents/${docId}/fichier`, { responseType: 'blob' }); }

  tasks(id: string): Observable<RoomTask[]> { return this.http.get<RoomTask[]>(`${this.url}/${id}/taches`); }
  addTask(id: string, t: { title: string; assigneeId: string | null; dueDate: string | null }): Observable<RoomTask[]> { return this.http.post<RoomTask[]>(`${this.url}/${id}/taches`, t); }
  moveTask(id: string, taskId: string, status: TaskStatus, position: number): Observable<RoomTask[]> { return this.http.put<RoomTask[]>(`${this.url}/${id}/taches/${taskId}/etat`, { status, position }); }
  deleteTask(id: string, taskId: string): Observable<RoomTask[]> { return this.http.delete<RoomTask[]>(`${this.url}/${id}/taches/${taskId}`); }
}
