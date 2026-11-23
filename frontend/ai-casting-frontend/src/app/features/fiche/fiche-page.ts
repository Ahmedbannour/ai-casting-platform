import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { map } from 'rxjs';
import { FicheComponent } from './fiche';
import { DemandeDetail, DemandeService, PersonOption } from '../../core/services/demande.service';
import { InviteCardComponent } from '../demandes/invite-card';
import { DiscussionComponent } from '../demandes/discussion';
import { LiveService } from '../../core/services/live.service';

/**
 * P-084 · La page d'un projet, c'est son dossier : un seul document qui se construit au fil des rôles.
 * Autour du dossier : les invitations, l'équipe de réalisation, la discussion et le fil d'activité.
 */
@Component({
  selector: 'app-fiche-page',
  standalone: true,
  imports: [RouterLink, DatePipe, FormsModule, FicheComponent, InviteCardComponent, DiscussionComponent],
  template: `
  <section class="page">
    <nav class="crumbs" aria-label="Fil d'Ariane"><a routerLink="/mes-demandes">← Projets</a></nav>
    @if (fatal()) { <p class="err" role="alert">{{ fatal() }}</p> }
    @if (d(); as x) {
      <h1 class="sr">{{ x.title }} : dossier du film</h1>
      <p class="parties">
        <span><small>Marque</small>{{ x.hasBrand ? x.brandName : 'à inviter' }}</span>
        <span><small>Agence</small>{{ x.agencyName || 'à inviter' }}</span>
        <span><small>Production</small>{{ x.productionName || '—' }}</span>
        @if (x.directorName) { <span><small>Réalisation</small>{{ x.directorName }}{{ x.firstAdName ? ' · ' + x.firstAdName : '' }}</span> }
      </p>
      @if (x.canInvite && (!x.hasBrand || !x.agencyName)) { <app-invite-card [d]="x" (changed)="load()" /> }
    }
    @if (id(); as i) { <app-fiche [requestId]="i" [directorAttached]="!!d()?.directorId" /> }

    @if (d(); as x) {
      @if (x.canAttachTeam) {
        <section class="card team" aria-labelledby="team-h">
          <h2 id="team-h">L'équipe de réalisation</h2>
          <p class="muted">Rattachez le réalisateur et son 1er assistant : ils écrivent la note d'intention et les rôles dans le dossier. Sans réalisateur, vous les écrivez vous-même.</p>
          <form class="team-row" (ngSubmit)="saveTeam()">
            <label>Réalisateur
              <select name="dir" [(ngModel)]="directorId" (ngModelChange)="firstAdId = $event ? firstAdId : null">
                <option [ngValue]="null">Pas de réalisateur</option>
                @for (p of directors(); track p.id) { <option [ngValue]="p.id">{{ p.name }}{{ p.organisation ? ' · ' + p.organisation : '' }}</option> }
              </select></label>
            <label>1er assistant réalisateur
              <select name="ad" [(ngModel)]="firstAdId" [disabled]="!directorId">
                <option [ngValue]="null">Aucun</option>
                @for (p of directors(); track p.id) { @if (p.id !== directorId) { <option [ngValue]="p.id">{{ p.name }}</option> } }
              </select></label>
            <button type="submit" class="go" [disabled]="busy()">Enregistrer l'équipe</button>
          </form>
          @if (teamMsg()) { <p class="ok" role="status">{{ teamMsg() }}</p> }
          @if (teamErr()) { <p class="err" role="alert">{{ teamErr() }}</p> }
        </section>
      }
      <app-discussion [d]="x" />
      @if (x.events.length) {
        <section class="card" aria-labelledby="log-h">
          <h2 id="log-h">Fil d'activité</h2>
          <ul class="journal">
            @for (e of x.events.slice(0, showAll() ? 200 : 8); track $index) {
              <li><time>{{ e.createdAt | date:'d MMM, HH:mm' }}</time><span>{{ e.message }}@if (e.actorName && !e.message.includes(e.actorName)) { <em> · {{ e.actorName }}</em> }</span></li>
            }
          </ul>
          @if (x.events.length > 8 && !showAll()) { <button type="button" class="ghost" (click)="showAll.set(true)">Tout l'historique ({{ x.events.length }})</button> }
        </section>
      }
      @if (hasOldVersions()) { <p class="legacy"><a [routerLink]="['/demandes', x.id, 'historique']">Voir les anciennes versions (V0, V1, V2) de ce projet</a></p> }
    }
  </section>
  `,
  styles: [`
    :host { display: block; }
    .page { padding: 18px 32px 64px; max-width: 1180px; display: flex; flex-direction: column; gap: 16px; }
    .crumbs a { color: var(--text-muted); text-decoration: none; font-size: 13.5px; display: inline-flex; align-items: center; min-height: 32px; }
    .crumbs a:hover { color: var(--text-primary); }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .parties { margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .parties span { display: flex; flex-direction: column; padding: 7px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--glass); font-size: 14px; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
    .parties small { font-size: 11.5px; font-weight: 700; color: var(--text-muted); }
    .card { padding: 18px 20px; border-radius: 18px; border: 1px solid var(--border); background: var(--glass); display: flex; flex-direction: column; gap: 10px; max-width: 900px; }
    .card h2 { margin: 0; font-size: 19px; }
    .muted { margin: 0; color: var(--text-muted); font-size: 14px; }
    .team-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; }
    .team-row label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; }
    .team-row select { min-height: 44px; }
    @media (max-width: 700px) { .team-row { grid-template-columns: 1fr; } }
    .go { min-height: 44px; padding: 0 18px; border: 0; border-radius: 999px; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 700; cursor: pointer; }
    .ghost { align-self: flex-start; min-height: 40px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: none; color: var(--text-primary); font: inherit; font-weight: 600; cursor: pointer; }
    .journal { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .journal li { display: grid; grid-template-columns: 110px 1fr; gap: 10px; font-size: 14px; }
    .journal time { color: var(--text-muted); font-size: 13px; }
    .journal em { color: var(--text-muted); font-style: normal; }
    .legacy { margin: 0; font-size: 13.5px; } .legacy a { color: var(--text-muted); }
    app-discussion { max-width: 900px; }
    @media (max-width: 900px) { .page { padding: 12px 14px 110px; } .journal li { grid-template-columns: 1fr; gap: 2px; } }
  `]
})
export class FichePageComponent {
  private readonly api = inject(DemandeService);
  readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map(p => p.get('id'))), { initialValue: null });
  readonly d = signal<DemandeDetail | null>(null);
  readonly fatal = signal('');
  readonly directors = signal<PersonOption[]>([]);
  readonly busy = signal(false);
  readonly teamMsg = signal('');
  readonly teamErr = signal('');
  readonly showAll = signal(false);
  readonly hasOldVersions = computed(() => (this.d()?.versions ?? []).some(v => !!(v.body || v.fileName || v.linkUrl)));
  directorId: string | null = null;
  firstAdId: string | null = null;

  constructor() {
    effect(() => { this.id(); untracked(() => this.load()); });
    inject(LiveService).watch(inject(DestroyRef), () => this.load(true), () => this.busy());
  }

  load(silent = false): void {
    const id = this.id(); if (!id) return;
    this.api.get(id).subscribe({
      next: x => {
        this.d.set(x);
        if (!silent || !this.busy()) { this.directorId = x.directorId; this.firstAdId = x.firstAdId; }
        if (x.canAttachTeam && !this.directors().length) this.api.directors().subscribe({ next: p => this.directors.set(p), error: () => {} });
      },
      error: (e: HttpErrorResponse) => { if (!silent) this.fatal.set(e.status === 404 ? 'Ce projet n’existe pas ou ne vous est pas visible.' : 'Impossible de charger le projet.'); }
    });
  }

  saveTeam(): void {
    const id = this.id(); if (!id) return;
    this.busy.set(true); this.teamMsg.set(''); this.teamErr.set('');
    this.api.attachTeam(id, this.directorId, this.firstAdId).subscribe({
      next: x => { this.busy.set(false); this.d.set(x); this.teamMsg.set(x.directorName ? `Équipe enregistrée : ${x.directorName}${x.firstAdName ? ' et ' + x.firstAdName : ''}.` : 'Pas de réalisateur : vous écrivez la note d’intention et les rôles.'); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.teamErr.set(e.error?.message || 'L’équipe n’a pas pu être enregistrée.'); }
    });
  }
}
