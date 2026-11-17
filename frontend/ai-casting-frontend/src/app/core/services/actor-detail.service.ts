import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CommentDto {
  id: string;
  content: string;
  authorName: string;
  createdAt: string;
}

export interface DocumentResponse {
  id: string;
  name: string;
  originalName: string;
  type: string;
  url: string;
  size: number;
  createdAt: string;
}

export interface ActorDetail {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  age: number;
  gender: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  /** T-094 : coordonnées masquées tant que l'agent ne les demande pas. */
  contactHidden?: boolean;
  bio: string;
  height: number;
  weight: number;
  eyeColor: string;
  hairColor: string;
  mainPhotoUrl: string;
  photos: any[];
  skills: any[];
  languages: any[];
  experiences: any[];
  availabilities: any[];
  comments: CommentDto[];
  documents: DocumentResponse[];
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ActorDetailService {

  constructor(private http: HttpClient) {}

  private url(id: string): string {
    return `${environment.apiUrl}/actors/${id}`;
  }

  /** Révèle téléphone et e-mail ; la consultation est tracée et visible de l'acteur (T-094). */
  revealContact(id: string): Observable<{ phone: string | null; email: string | null }> {
    return this.http.post<{ phone: string | null; email: string | null }>(`${this.url(id)}/contact`, {});
  }

  getDetail(id: string): Observable<ActorDetail> {
    return this.http.get<ActorDetail>(`${this.url(id)}/detail`);
  }

  addComment(id: string, content: string): Observable<CommentDto> {
    return this.http.post<CommentDto>(`${this.url(id)}/comments`, { content });
  }

  deleteComment(actorId: string, commentId: string): Observable<void> {
    return this.http.delete<void>(`${this.url(actorId)}/comments/${commentId}`);
  }

  uploadDocument(actorId: string, file: File): Observable<DocumentResponse> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<DocumentResponse>(`${this.url(actorId)}/documents`, form);
  }

  deleteDocument(actorId: string, docId: string): Observable<void> {
    return this.http.delete<void>(`${this.url(actorId)}/documents/${docId}`);
  }
}
