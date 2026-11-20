import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { TokenService } from '../../../core/services/token.service';

/** T-110 · « Mes données » dans « Mon profil » : télécharger toutes ses données, supprimer son compte. */
@Component({
  selector: 'app-my-data',
  standalone: true,
  imports: [FormsModule],
  template: `
  <section class="md" aria-labelledby="md-h">
    <h2 id="md-h">Mes données</h2>
    <p class="lead">Vous pouvez à tout moment récupérer ce que la plateforme garde sur vous, ou supprimer votre compte.</p>

    <div class="item">
      <div class="txt">
        <h3>Télécharger mes données</h3>
        <p>Une archive ZIP avec votre fiche, vos photos, vos documents, vos accords, les consultations de vos coordonnées par les agences et les propositions de rôle reçues.</p>
        @if (exportError()) { <p class="err" role="alert">{{ exportError() }}</p> }
      </div>
      <button type="button" class="btn" [disabled]="exporting()" (click)="exportData()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>{{ exporting() ? 'Préparation…' : 'Télécharger' }}</button>
    </div>

    <div class="item danger" [class.open]="open()">
      <div class="txt">
        <h3>Supprimer mon compte</h3>
        <p>Votre compte, votre fiche, vos photos et vos documents sont effacés définitivement. Les agences ne vous trouveront plus. Cette action ne peut pas être annulée.</p>
      </div>
      @if (!open()) {
        <button type="button" class="btn red-line" (click)="open.set(true)">Supprimer mon compte…</button>
      }
    </div>
    @if (open()) {
      @if (done()) {
        <p class="bye" role="status">Votre compte est supprimé. Au revoir et merci d’avoir utilisé Cercle.</p>
      } @else {
        <form class="confirm" (ngSubmit)="remove()" novalidate>
          <p>Pensez à télécharger vos données avant : après la suppression, plus rien ne pourra être récupéré.</p>
          @if (local()) {
            <label for="md-pw">Votre mot de passe</label>
            <input id="md-pw" name="pw" type="password" [(ngModel)]="password" (ngModelChange)="error.set('')" autocomplete="current-password" />
          }
          <label for="md-ok">Tapez <b>SUPPRIMER</b> pour confirmer</label>
          <input id="md-ok" name="ok" [(ngModel)]="confirm" (ngModelChange)="error.set('')" autocomplete="off" spellcheck="false" />
          @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
          <div class="row">
            <button type="button" class="btn" (click)="cancel()">Annuler</button>
            <button type="submit" class="btn red" [disabled]="busy()">{{ busy() ? 'Suppression…' : 'Supprimer définitivement' }}</button>
          </div>
        </form>
      }
    }
  </section>`,
  styles: [`
    .md { margin-top: 28px; padding: 22px; border-radius: 16px; border: 1px solid var(--border); background: var(--glass, transparent); }
    h2 { font-size: 20px; margin: 0 0 4px; } .lead { margin: 0 0 14px; color: var(--text-muted); font-size: 14px; }
    .item { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
    .txt { flex: 1 1 320px; min-width: 0; } h3 { font-size: 15px; margin: 0 0 4px; } .txt p { margin: 0; color: var(--text-muted); font-size: 13.5px; line-height: 1.5; }
    .danger h3 { color: var(--danger); }
    .btn { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--border); background: transparent;
      color: var(--text-primary); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap;
      svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      &:hover { border-color: var(--text-muted); } &:disabled { opacity: .6; cursor: progress; } }
    .red-line { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); &:hover { border-color: var(--danger); } }
    .red { background: var(--danger); border-color: var(--danger); color: #fff; }
    .confirm { display: grid; gap: 6px; max-width: 460px; padding: 14px; border-radius: 12px; background: color-mix(in srgb, var(--danger) 7%, transparent);
      border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
      p { margin: 0 0 6px; font-size: 13.5px; color: var(--text-muted); } label { font-size: 13px; font-weight: 600; margin-top: 6px; }
      input { height: 40px; border-radius: 9px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); padding: 0 11px; font: inherit; }
      .row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; flex-wrap: wrap; } }
    .err { color: var(--danger); font-size: 13.5px; margin: 6px 0 0; }
    .bye { padding: 14px; border-radius: 12px; background: var(--accent-dim); margin: 0; }
  `]
})
export class MyDataComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);
  private readonly router = inject(Router);
  readonly exporting = signal(false);
  readonly exportError = signal('');
  readonly open = signal(false);
  readonly local = signal(true);
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly error = signal('');
  password = ''; confirm = '';

  ngOnInit(): void {
    this.http.get<{ provider: string }>(`${environment.apiUrl}/me/email`).subscribe({ next: r => this.local.set(r.provider === 'LOCAL'), error: () => {} });
  }

  exportData(): void {
    this.exporting.set(true); this.exportError.set('');
    this.http.get(`${environment.apiUrl}/me/export`, { responseType: 'blob', observe: 'response' }).subscribe({
      next: res => {
        const name = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'mes-donnees-ai-casting.zip';
        const url = URL.createObjectURL(res.body!);
        const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        this.exporting.set(false);
      },
      error: () => { this.exporting.set(false); this.exportError.set('Préparation de l’archive impossible. Réessayez.'); }
    });
  }

  cancel(): void { this.open.set(false); this.password = ''; this.confirm = ''; this.error.set(''); }

  remove(): void {
    if (this.local() && !this.password) { this.error.set('Indiquez votre mot de passe.'); return; }
    if (this.confirm.trim().toUpperCase() !== 'SUPPRIMER') { this.error.set('Tapez « SUPPRIMER » pour confirmer.'); return; }
    this.busy.set(true);
    this.http.post(`${environment.apiUrl}/me/delete`, { password: this.password, confirm: this.confirm }).subscribe({
      next: () => {
        this.done.set(true); this.password = '';
        this.tokens.clearTokens();
        setTimeout(() => this.router.navigateByUrl('/'), 2600);
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Suppression impossible. Réessayez.'); }
    });
  }
}
