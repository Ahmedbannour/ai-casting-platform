import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CastingRole, CastingService, EntryStatus, STATUSES, ShortlistEntry, criteria, importanceLabel } from '../../core/services/casting.service';
import { RoleFormComponent } from './role-form';
import { ProjectService } from '../../core/services/project.service';
import { frDate } from '../../shared/forms/dates';
import { DateFieldComponent } from '../../shared/components/date-field/date-field';
import { SelectFieldComponent } from '../../shared/components/select-field/select-field';
import { SharePanelComponent } from './share-panel';
import { OfferDialogComponent } from './offer-dialog';
import { OFFER_KIND, OFFER_STATUS, OfferRow, OfferService } from '../../core/services/offer.service';
import { ShareService, VOTE_LABEL, VoteRow } from '../../core/services/share.service';

/** Page d'un rôle : critères, recherche pré-remplie et shortlist en colonnes par statut (US-11 à US-14). */
@Component({
  selector: 'app-role-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, RoleFormComponent, DateFieldComponent, SelectFieldComponent, SharePanelComponent, OfferDialogComponent],
  template: `
  <div class="page">
    @if (role(); as r) {
      <a [routerLink]="['/projects', r.projectId]" class="back"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg> {{ r.projectTitle }}</a>

      <header class="head">
        <div class="head-main">
          <div class="meta">
            <span class="tag">{{ importanceLabel(r.importance) }}</span>
            @if (r.filled) { <span class="tag done">Pourvu</span> } @else { <span class="tag">À pourvoir</span> }
          </div>
          <h1>{{ r.name }}</h1>
          <p class="crit">{{ criteria(r) }}</p>
          @if (r.description) { <p class="desc">{{ r.description }}</p> }
        </div>
        <div class="head-actions">
          <button type="button" class="btn-primary" (click)="find()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            Trouver des acteurs
          </button>
          <button type="button" class="btn-ghost" (click)="shareOpen.set(true)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/></svg>
            Envoyer au réalisateur
          </button>
          <a class="btn-ghost" [routerLink]="['/roles', r.id, 'planche']">Planche PDF</a>
          <button type="button" class="btn-ghost" (click)="editOpen.set(true)">Modifier le rôle</button>
        </div>
      </header>

      <p class="summary">
        @for (s of statuses; track s.value; let last = $last) {
          <span><b>{{ byStatus()[s.value].length }}</b> {{ s.label.toLowerCase() }}</span>@if (!last) {<span class="dot" aria-hidden="true"></span>}
        }
      </p>

      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

      <div class="board">
        @for (s of statuses; track s.value) {
          <section class="col" [class.drop]="dragOver() === s.value" [attr.data-s]="s.value"
                   (dragover)="$event.preventDefault(); dragOver.set(s.value)" (dragleave)="dragOver.set(null)"
                   (drop)="onDrop($event, s.value)" [attr.aria-label]="s.label">
            <h2>{{ s.label }} <span>{{ byStatus()[s.value].length }}</span></h2>
            @for (e of byStatus()[s.value]; track e.id) {
              <article class="card" draggable="true" (dragstart)="dragId = e.id" (dragend)="dragOver.set(null)">
                <div class="who">
                  <span class="avatar">
                    @if (e.photoUrl && !broken().has(e.photoUrl)) { <img [src]="e.photoUrl" alt="" (error)="markBroken(e.photoUrl)" /> }
                    @else { {{ (e.firstName[0] || '') + (e.lastName[0] || '') }} }
                  </span>
                  <div class="who-text">
                    <a [routerLink]="['/actors', e.actorId]" class="name">{{ e.firstName }} {{ e.lastName }}</a>
                    <span class="sub">{{ e.age ? e.age + ' ans' : '' }}{{ e.age && e.city ? ' · ' : '' }}{{ e.city || '' }}</span>
                  </div>
                </div>
                @if (e.paused) {
                  <p class="paused" title="L'acteur a mis son profil en pause : il n'apparaît plus aux réalisateurs.">Profil en pause</p>
                }
                @if (e.availability === 'A_VERIFIER') {
                  <p class="avail warn" [title]="e.availabilityNote || ''">⚠ {{ e.availabilityNote }}</p>
                } @else if (e.availability === 'OK') {
                  <p class="avail ok">✓ Disponible pendant le tournage</p>
                }
                @for (v of votesFor(e.id); track v.voterName + v.updatedAt) {
                  <p class="vote" [attr.data-v]="v.vote">
                    <b>{{ voteLabel[v.vote] }}</b> · {{ v.voterName }}
                    @if (v.comment) { <span class="vote-c">« {{ v.comment }} »</span> }
                  </p>
                }
                @if (offerFor(e.id); as o) {
                  <p class="offer" [attr.data-s]="o.status">
                    <b>{{ offerKind[o.kind] }}</b> · {{ offerStatus[o.status] }}
                    @if (o.answerNote) { <span class="vote-c">« {{ o.answerNote }} »</span> }
                    @if (o.status === 'ENVOYEE') { <button type="button" class="offer-cancel" (click)="cancelOffer(o)">Retirer</button> }
                  </p>
                }
                <div class="aud">
                  <span>Audition</span>
                  <app-date-field [ngModel]="e.auditionDate || ''" (ngModelChange)="setAudition(e, $event)" [ngModelOptions]="{ standalone: true }"
                                  [ariaLabel]="'Date d’audition de ' + e.firstName" placeholder="à fixer"
                                  [max]="r.shootEnd || null" [openAt]="r.shootStart"
                                  [maxMessage]="'Après la fin du tournage.'"
                                  [hint]="r.shootStart ? 'Tournage le ' + frDate(r.shootStart) : ''" [compact]="true" />
                </div>
                @if (editingNote() === e.id) {
                  <textarea [(ngModel)]="noteDraft" rows="2" (keydown.enter)="$event.preventDefault(); saveNote(e)"
                            (keydown.escape)="editingNote.set(null)" aria-label="Note" autofocus></textarea>
                  <div class="note-actions">
                    <button type="button" (click)="editingNote.set(null)">Annuler</button>
                    <button type="button" class="ok" (click)="saveNote(e)">Enregistrer</button>
                  </div>
                } @else {
                  <button type="button" class="note" (click)="editNote(e)">{{ e.note || 'Ajouter une note' }}</button>
                }
                <div class="card-foot">
                  @if (e.hasAccount && !e.paused && offerFor(e.id)?.status !== 'ENVOYEE') {
                    <button type="button" class="propose" (click)="offerTo.set(e)" [attr.aria-label]="'Proposer le rôle ou convoquer ' + e.firstName" title="Proposer le rôle ou convoquer à une audition">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg>
                    </button>
                  }
                  <app-select class="status" [options]="cardStatuses" [ngModel]="e.status" (ngModelChange)="move(e, $event)" ariaLabel="Statut" [compact]="true" />
                  <button type="button" class="remove" (click)="remove(e)" [attr.aria-label]="'Retirer ' + e.firstName + ' ' + e.lastName + ' de la shortlist'" title="Retirer de la shortlist">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
                  </button>
                </div>
              </article>
            } @empty {
              <p class="col-empty">
                @if (s.value === 'PRESELECTIONNE') { Glissez des cartes à droite dans la recherche pour remplir cette colonne. }
                @else { Déposez un acteur ici. }
              </p>
            }
          </section>
        }
      </div>
    } @else if (notFound()) {
      <div class="empty"><h3>Rôle introuvable</h3><p>Il a peut-être été supprimé.</p><a routerLink="/projects" class="btn-ghost">Retour aux projets</a></div>
    } @else {
      <div class="skel"></div>
    }
  </div>

  @if (undo(); as u) {
    <div class="toast" role="status">
      {{ u.entry.firstName }} {{ u.entry.lastName }} retiré de la shortlist
      <button type="button" (click)="cancelRemove()">Annuler</button>
    </div>
  }

  @if (offerTo(); as t) {
    <app-offer-dialog [entryId]="t.id" [actorName]="t.firstName + ' ' + t.lastName" [shootStart]="role()?.shootStart ?? null" [shootEnd]="role()?.shootEnd ?? null"
                      (close)="offerTo.set(null)" (sent)="offerTo.set(null); loadOffers()" />
  }

  @if (shareOpen() && role()) {
    <app-share-panel [roleId]="role()!.id" [roleName]="role()!.name" (close)="shareOpen.set(false); loadVotes()" />
  }

  @if (editOpen() && role()) {
    <app-role-form [projectId]="role()!.projectId" [role]="role()" [projectStart]="projectStart()" [projectEnd]="projectEnd()" (saved)="role.set($event); editOpen.set(false)" (cancel)="editOpen.set(false)" />
  }
  `,
  styles: [`
  :host { display: block; flex: 1 0 auto; }  /* au moins la hauteur de l'écran, et grandit avec le contenu (le bas de page reste au-dessus du menu mobile) */
  .page { min-height: 100%; padding: 24px 32px 32px; display: flex; flex-direction: column; gap: 16px; }
  .back { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px 0 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--glass); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); color: var(--text-muted); text-decoration: none; font-size: 13.5px; font-weight: 500; transition: color .15s, border-color .15s, background .15s; svg { transition: transform .2s cubic-bezier(.2,.8,.2,1); } &:hover { color: var(--text-primary); border-color: var(--accent); } &:hover svg { transform: translateX(-3px); } }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; padding: 22px;
    border-radius: var(--radius-l); border: 1px solid var(--border); background: var(--glass); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }
  .meta { display: flex; gap: 8px; margin-bottom: 10px; }
  .tag { font-size: 12.5px; padding: 2px 8px; border-radius: 4px; background: var(--bg-hover); color: var(--text-muted); }
  .tag.done { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  h1 { font-size: 38px; line-height: 1.05; }
  .crit { margin-top: 8px; color: var(--text-muted); }
  .desc { margin-top: 8px; max-width: 64ch; line-height: 1.6; }
  .head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn-ghost, .btn-primary { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: var(--radius-s);
    font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; }
  .btn-ghost { border: 1px solid var(--border); background: var(--glass); color: var(--text-primary); font-weight: 500; &:hover { background: var(--bg-hover); } }
  .btn-primary { border: none; background: var(--accent); color: var(--on-accent); &:hover { background: var(--accent-hover); } }
  .summary { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--text-muted); font-size: 14px; b { color: var(--text-primary); } }
  .dot { width: 3px; height: 3px; border-radius: 50%; background: var(--text-subtle); }
  .err { color: var(--danger); font-size: 14px; }

  .board { display: grid; grid-template-columns: repeat(5, minmax(200px, 1fr)); gap: 12px; overflow-x: auto; padding-bottom: 6px; align-items: start; }
  .col { min-height: 220px; padding: 10px; border-radius: var(--radius-m); border: 1px solid var(--border); background: var(--glass);
    -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); display: flex; flex-direction: column; gap: 8px; transition: border-color .15s, background .15s; }
  .col.drop { border-color: var(--accent); background: var(--accent-dim); }
  .col[data-s="CHOISI"] { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }
  .col h2 { font-size: 14px; font-weight: 600; font-stretch: 100%; display: flex; justify-content: space-between; padding: 2px 4px 4px;
    span { color: var(--text-subtle); font-variant-numeric: tabular-nums; } }
  .col-empty { font-size: 12.5px; color: var(--text-subtle); padding: 8px 4px; line-height: 1.45; }

  .card { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: var(--radius-s); border: 1px solid var(--border);
    background: var(--bg-surface); cursor: grab; animation: in .25s cubic-bezier(.2,.8,.2,1) both;
    &:active { cursor: grabbing; } }
  .col[data-s="CHOISI"] .card { border-color: var(--accent); }
  .col[data-s="REFUSE"] .card { opacity: .6; }
  @keyframes in { from { opacity: 0; transform: translateY(6px); } }
  .who { display: flex; align-items: center; gap: 10px; }
  .avatar { width: 38px; height: 38px; flex: none; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: var(--bg-hover);
    font-size: 12px; font-weight: 700; img { width: 100%; height: 100%; object-fit: cover; } }
  .who-text { display: flex; flex-direction: column; min-width: 0; }
  .name { font-weight: 700; font-stretch: var(--narrow); font-size: 15.5px; color: var(--text-primary); text-decoration: none;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; &:hover { text-decoration: underline; } }
  .sub { font-size: 12px; color: var(--text-muted); }
  .avail { font-size: 12px; line-height: 1.35; padding: 4px 6px; border-radius: 4px; }
  .avail.warn { background: color-mix(in srgb, var(--reject) 16%, transparent); color: var(--text-primary); }
  .avail.ok { color: var(--text-muted); }
  .paused { font-size: 12px; padding: 4px 7px; border-radius: 4px; border: 1px dashed var(--text-subtle); color: var(--text-muted); }
  .offer { font-size: 12px; line-height: 1.4; padding: 5px 7px; border-radius: 4px; background: var(--accent-dim); color: var(--text-muted);
    b { color: var(--text-primary); } }
  .offer[data-s="ACCEPTEE"] { background: color-mix(in srgb, var(--series-3) 18%, transparent); }
  .offer[data-s="DECLINEE"], .offer[data-s="ANNULEE"] { background: var(--bg-hover); }
  .offer-cancel { border: none; background: none; padding: 0; margin-left: 4px; color: var(--accent); font-size: 12px; font-weight: 600; cursor: pointer; }
  /* Enveloppe en haut à droite, à côté de la corbeille : le statut garde toute la largeur */
  .card-foot .propose { position: absolute; top: 3px; right: 29px; width: 24px; height: 24px; display: grid; place-items: center; border: none; border-radius: 6px;
    background: none; color: var(--text-subtle); cursor: pointer; opacity: .7; &:hover { color: var(--accent); background: var(--bg-hover); opacity: 1; } }
  .card:has(.propose) .who { padding-right: 40px; }
  .vote { font-size: 12px; line-height: 1.4; padding: 5px 7px; border-radius: 4px; border-left: 3px solid var(--text-subtle); background: var(--bg-hover); color: var(--text-muted);
    b { color: var(--text-primary); } }
  .vote[data-v="OUI"] { border-left-color: var(--series-3); }
  .vote[data-v="PEUT_ETRE"] { border-left-color: var(--series-2); }
  .vote-c { display: block; margin-top: 2px; font-style: italic; }
  .aud { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-muted);
    app-date-field { min-width: 0; } }
  .note { text-align: left; border: none; background: none; padding: 0; font-size: 12.5px; color: var(--text-muted); cursor: text; line-height: 1.4;
    &:hover { color: var(--text-primary); } }
  textarea { width: 100%; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--accent); background: var(--glass); color: var(--text-primary);
    font-size: 13px; resize: vertical; outline: none; }
  .note-actions { display: flex; justify-content: flex-end; gap: 6px;
    button { border: none; background: none; color: var(--text-muted); font-size: 12.5px; cursor: pointer; } .ok { color: var(--accent); font-weight: 600; } }
  .card-foot { display: flex; align-items: center; gap: 6px; }
  /* Corbeille en haut à droite de la carte : le statut garde toute la largeur. */
  .card { position: relative; }
  .card .who { padding-right: 14px; }
  .card-foot .remove { position: absolute; top: 3px; right: 3px; width: 24px; height: 24px; opacity: .55; transition: opacity .15s, color .15s, background .15s; }
  .card:hover .remove, .card:focus-within .remove, .card-foot .remove:focus-visible { opacity: 1; }
  .status { flex: 1; min-width: 0; }
  .remove { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border: none; border-radius: 6px; background: none;
    color: var(--text-subtle); cursor: pointer; &:hover { color: var(--danger); background: var(--bg-hover); } }

  .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 60; display: flex; align-items: center; gap: 14px;
    padding: 10px 14px 10px 16px; border-radius: var(--radius-m); background: var(--glass-strong); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
    border: 1px solid var(--border); box-shadow: 0 16px 40px rgba(0,0,0,.35); font-size: 14px; animation: up .25s cubic-bezier(.2,.8,.2,1) both;
    button { border: none; background: none; color: var(--accent); font-weight: 700; cursor: pointer; } }
  @keyframes up { from { opacity: 0; transform: translate(-50%, 12px); } }
  .empty { padding: 44px 24px; text-align: center; border-radius: var(--radius-m); border: 1px dashed var(--border); background: var(--glass);
    h3 { font-size: 22px; margin-bottom: 8px; } p { color: var(--text-muted); margin-bottom: 16px; } }
  .skel { height: 180px; border-radius: var(--radius-l); background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-surface) 50%, var(--bg-hover) 75%);
    background-size: 200% 100%; animation: skel 1.4s linear infinite; }
  @keyframes skel { to { background-position: -200% 0; } }
  @container page (max-width: 760px) { .page { padding: 20px 16px; } h1 { font-size: 30px; } }
  `]
})
export class RoleDetailComponent implements OnInit, OnDestroy {
  private readonly casting = inject(CastingService);
  private readonly projects = inject(ProjectService);
  readonly projectStart = signal<string | null>(null);
  readonly projectEnd = signal<string | null>(null);
  /** Statut d'un candidat, au singulier (les titres de colonnes restent au pluriel). */
  readonly cardStatuses = STATUSES.map(o => ({ value: o.value, label: ({ PRESELECTIONNE: 'Présélectionné', REFUSE: 'Refusé' } as Record<string, string>)[o.value] ?? o.label }));
  readonly frDate = frDate;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly statuses = STATUSES;
  readonly role = signal<CastingRole | null>(null);
  readonly entries = signal<ShortlistEntry[]>([]);
  readonly notFound = signal(false);
  readonly error = signal('');
  readonly editOpen = signal(false);
  readonly shareOpen = signal(false);
  private readonly offerApi = inject(OfferService);
  readonly offerKind = OFFER_KIND;
  readonly offerStatus = OFFER_STATUS;
  readonly offerTo = signal<ShortlistEntry | null>(null);
  readonly offers = signal<Map<string, OfferRow>>(new Map());
  private readonly shareApi = inject(ShareService);
  readonly voteLabel = VOTE_LABEL;
  /** Avis du réalisateur, par candidat (le plus récent d'abord). */
  readonly votes = signal<Map<string, VoteRow[]>>(new Map());
  readonly dragOver = signal<EntryStatus | null>(null);
  readonly editingNote = signal<string | null>(null);
  readonly broken = signal<Set<string>>(new Set());
  readonly undo = signal<{ entry: ShortlistEntry; timer: ReturnType<typeof setTimeout> } | null>(null);
  dragId: string | null = null;
  noteDraft = '';
  criteria = criteria;
  importanceLabel = importanceLabel;

  readonly byStatus = computed(() => {
    const out = { PRESELECTIONNE: [], AUDITION: [], RAPPEL: [], CHOISI: [], REFUSE: [] } as Record<EntryStatus, ShortlistEntry[]>;
    for (const e of this.entries()) out[e.status].push(e);
    return out;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.casting.role(id).subscribe({
      next: r => {
        this.role.set(r);
        // Période du projet : bornes du tournage dans le formulaire du rôle.
        this.projects.get(r.projectId).subscribe(p => { this.projectStart.set(p.startDate); this.projectEnd.set(p.endDate); });
      },
      error: () => this.notFound.set(true)
    });
    this.casting.shortlist(id).subscribe({ next: e => this.entries.set(e) });
    this.loadVotes(id);
    this.loadOffers(id);
  }

  offerFor(entryId: string): OfferRow | undefined { return this.offers().get(entryId); }

  loadOffers(id = this.role()?.id): void {
    if (!id) return;
    this.offerApi.forRole(id).subscribe({ next: list => this.offers.set(new Map(list.map(o => [o.entryId, o]))) });
    this.casting.shortlist(id).subscribe({ next: e => this.entries.set(e) });
  }

  cancelOffer(o: OfferRow): void {
    this.offerApi.cancel(o.id).subscribe({ next: () => this.loadOffers(), error: () => this.error.set('Retrait impossible. Réessayez.') });
  }

  votesFor(entryId: string): VoteRow[] { return this.votes().get(entryId) ?? []; }

  loadVotes(id = this.role()?.id): void {
    if (!id) return;
    this.shareApi.votes(id).subscribe({ next: list => {
      const m = new Map<string, VoteRow[]>();
      for (const v of list) m.set(v.entryId, [...(m.get(v.entryId) ?? []), v]);
      this.votes.set(m);
    } });
  }

  ngOnDestroy(): void { this.flushRemove(); }

  find(): void { this.router.navigate(['/chat'], { queryParams: { role: this.role()!.id, n: Date.now() } }); }

  onDrop(ev: DragEvent, status: EntryStatus): void {
    ev.preventDefault();
    this.dragOver.set(null);
    const e = this.entries().find(x => x.id === this.dragId);
    this.dragId = null;
    if (e && e.status !== status) this.move(e, status);
  }

  /** Change le statut ; un second « choisi » demande de confirmer le remplacement (US-12). */
  move(e: ShortlistEntry, status: EntryStatus, replaceChosen = false): void {
    this.error.set('');
    const previous = e.status;
    this.entries.update(list => list.map(x => x.id === e.id ? { ...x, status } : x));   // affichage immédiat
    this.casting.updateEntry(e.id, { status, replaceChosen }).subscribe({
      next: () => this.refresh(),
      error: (err: HttpErrorResponse) => {
        this.entries.update(list => list.map(x => x.id === e.id ? { ...x, status: previous } : x));
        if (err.status === 409 && status === 'CHOISI') {
          const current = this.byStatus().CHOISI[0];
          if (confirm(`${current ? current.firstName + ' ' + current.lastName : 'Un acteur'} est déjà choisi pour ce rôle. Le remplacer par ${e.firstName} ${e.lastName} ?`)) {
            this.move({ ...e, status: previous }, status, true);
          }
        } else {
          this.error.set(err.error?.message ?? 'Changement impossible. Réessayez.');
        }
      }
    });
  }

  /** Date d'audition (US-13). */
  setAudition(e: ShortlistEntry, value: string): void {
    if ((value || null) === (e.auditionDate || null)) return;
    const patch = value ? { auditionDate: value } : { clearAudition: true };
    this.casting.updateEntry(e.id, patch).subscribe(u => this.entries.update(list => list.map(x => x.id === u.id ? u : x)));
  }

  editNote(e: ShortlistEntry): void { this.noteDraft = e.note ?? ''; this.editingNote.set(e.id); }

  saveNote(e: ShortlistEntry): void {
    const note = this.noteDraft.trim();
    this.editingNote.set(null);
    this.casting.updateEntry(e.id, { note }).subscribe(u => this.entries.update(list => list.map(x => x.id === u.id ? u : x)));
  }

  /** Retrait avec annulation possible pendant 5 secondes (US-14). */
  remove(e: ShortlistEntry): void {
    this.flushRemove();
    this.entries.update(list => list.filter(x => x.id !== e.id));
    const timer = setTimeout(() => this.flushRemove(), 5000);
    this.undo.set({ entry: e, timer });
  }

  cancelRemove(): void {
    const u = this.undo();
    if (!u) return;
    clearTimeout(u.timer);
    this.entries.update(list => [...list, u.entry]);
    this.undo.set(null);
  }

  markBroken(url: string): void { this.broken.update(s => new Set(s).add(url)); }

  private flushRemove(): void {
    const u = this.undo();
    if (!u) return;
    clearTimeout(u.timer);
    this.undo.set(null);
    this.casting.removeEntry(u.entry.id).subscribe({ next: () => this.refreshRole() });
  }

  private refresh(): void {
    const id = this.role()!.id;
    this.casting.shortlist(id).subscribe(e => this.entries.set(e));
    this.refreshRole();
  }

  private refreshRole(): void {
    const r = this.role();
    if (r) this.casting.role(r.id).subscribe(x => this.role.set(x));
  }
}
