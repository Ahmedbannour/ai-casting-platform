import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PhotoResponse {
  id: string;
  url: string;
  thumbnailUrl: string;
  originalName: string;
  size: number;
  isMain: boolean;
  createdAt: string;
}

export interface PhotoUploadResponse {
  uploaded: number;
  photos: PhotoResponse[];
}

/**
 * Service for photo upload and management.
 */
@Injectable({ providedIn: 'root' })
export class PhotoService {

  constructor(private http: HttpClient) {}

  private url(actorId: string): string {
    return `${environment.apiUrl}/actors/${actorId}/photos`;
  }

  upload(actorId: string, files: File[]): Observable<PhotoUploadResponse> {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    return this.http.post<PhotoUploadResponse>(this.url(actorId), formData);
  }

  findAll(actorId: string): Observable<PhotoResponse[]> {
    return this.http.get<PhotoResponse[]>(this.url(actorId));
  }

  delete(actorId: string, photoId: string): Observable<void> {
    return this.http.delete<void>(`${this.url(actorId)}/${photoId}`);
  }

  setMain(actorId: string, photoId: string): Observable<PhotoResponse> {
    return this.http.put<PhotoResponse>(`${this.url(actorId)}/${photoId}/main`, {});
  }
}
