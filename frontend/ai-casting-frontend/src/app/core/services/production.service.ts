import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { InviteResult, PendingInvitation } from './demande.service';

export interface Assistant { id: string; name: string; email: string; enabled: boolean; perms: string[]; }
export interface ProTeam { assistants: Assistant[]; pending: PendingInvitation[]; allPerms: string[]; }
export interface ProInvitationPreview {
  kind: 'MARQUE' | 'AGENCE_MARKETING' | 'ASSISTANT_PROD'; email: string; productionName: string; inviterName: string | null;
  requestTitle: string | null; joinOrg: string | null; needsOrg: boolean; perms: string[]; expiresAt: number; roomId: string | null;
}

/** Le producer et ses assistantes ; le lien d'invitation (public) que reçoivent la marque, l'agence et l'assistante. */
@Injectable({ providedIn: 'root' })
export class ProductionService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/production`;
  private readonly pub = `${environment.apiUrl}/public/invitations-pro`;

  team(): Observable<ProTeam> { return this.http.get<ProTeam>(`${this.url}/equipe`); }
  inviteAssistant(email: string, perms: string[]): Observable<InviteResult> { return this.http.post<InviteResult>(`${this.url}/assistantes`, { email, perms }); }
  updateAssistant(id: string, body: { perms?: string[]; enabled?: boolean }): Observable<Assistant> { return this.http.put<Assistant>(`${this.url}/assistantes/${id}`, body); }
  revoke(invitationId: string): Observable<void> { return this.http.delete<void>(`${this.url}/invitations/${invitationId}`); }

  preview(token: string): Observable<ProInvitationPreview> { return this.http.get<ProInvitationPreview>(`${this.pub}/${encodeURIComponent(token)}`); }
  accept(token: string, body: Record<string, unknown>) { return this.http.post<{ accessToken: string; refreshToken: string; role: string }>(`${this.pub}/${encodeURIComponent(token)}/accept`, body); }

  /** Lien à envoyer à l'invité. */
  static link(token: string): string { return `${location.origin}/invitation-pro/${token}`; }
}
