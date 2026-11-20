import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Room, RoomMember, RoomPerms, RoomService, SIDE_LABEL } from '../../core/services/room.service';
import { RoomSwipeComponent } from './room-swipe';
import { RoomResultsComponent } from './room-results';
import { RoomDocsComponent } from './room-docs';
import { RoomTasksComponent } from './room-tasks';

type Tab = 'swipe' | 'resultats' | 'documents' | 'taches' | 'equipe';

/**
 * Room de casting d'un projet. La production la dirige ; chacun ne voit que les onglets que le chef de room lui ouvre :
 * swipe des candidats, tableau des résultats, documents partagés, tâches, équipe et autorisations.
 */
@Component({
  selector: 'app-room',
  standalone: true,
  imports: [RouterLink, FormsModule, RoomSwipeComponent, RoomResultsComponent, RoomDocsComponent, RoomTasksComponent],
  template: `
  <div class="page">
    <a class="back" routerLink="/rooms">← Mes rooms</a>
    @if (room(); as r) {
      <header class="head">
        <div class="ttl">
          <span class="kicker"><i class="live" aria-hidden="true"></i>Room de casting</span>
          <h1>{{ r.title }}</h1>
          <p>{{ r.roles.length }} rôle{{ r.roles.length > 1 ? 's' : '' }} · {{ r.members.length }} membre{{ r.members.length > 1 ? 's' : '' }}
            @if (r.me.lead) { · <b>vous dirigez cette room</b> }</p>
        </div>
        <div class="faces" aria-label="Membres de la room">
          @for (m of r.members.slice(0, 6); track m.userId) { <span class="face" [attr.data-r]="m.role" [title]="m.name + ' · ' + side(m.role)">{{ initials(m.name) }}</span> }
          @if (r.members.length > 6) { <span class="face more">+{{ r.members.length - 6 }}</span> }
        </div>
      </header>

      <nav class="tabs" role="tablist" aria-label="Espaces de la room">
        @for (t of tabs(); track t.id) {
          <button type="button" role="tab" [class.on]="tab() === t.id" [attr.aria-selected]="tab() === t.id" (click)="go(t.id)">
            <span class="ti" [innerHTML]="t.icon" aria-hidden="true"></span>{{ t.label }}
            @if (t.badge) { <span class="badge">{{ t.badge }}</span> }
          </button>
        }
      </nav>

      <section class="pane" [attr.data-tab]="tab()">
        @switch (tab()) {
          @case ('swipe') { <app-room-swipe [roomId]="r.id" [roles]="r.roles" (voted)="reload()" (showResults)="openResults($event)" /> }
          @case ('resultats') { <app-room-results [roomId]="r.id" [roles]="r.roles" [lead]="r.me.lead" [startRole]="resultsRole()" /> }
          @case ('documents') { <app-room-docs [roomId]="r.id" [canEdit]="r.me.docs" /> }
          @case ('taches') { <app-room-tasks [roomId]="r.id" [members]="r.members" [canEdit]="r.me.tasks" [myId]="r.myId" /> }
          @case ('equipe') {
            @if (r.me.lead) {
              <form class="invite" (ngSubmit)="invite()">
                <input name="email" type="email" [(ngModel)]="email" placeholder="E-mail du membre à inviter" aria-label="E-mail du membre à inviter" inputmode="email" />
                <button type="submit" class="primary" [disabled]="busy() || !email.trim()">Inviter</button>
              </form>
              <p class="hint">Touchez une autorisation pour l'ouvrir ou la fermer. Le chef de room a toutes les autorisations.</p>
            }
            <ul class="team">
              @for (m of r.members; track m.userId) {
                <li>
                  <span class="face big" [attr.data-r]="m.role">{{ initials(m.name) }}</span>
                  <div class="mi"><b>{{ m.name }} @if (m.userId === r.myId) { <small>(vous)</small> }</b>
                    <small>{{ side(m.role) }}{{ m.organisation ? ' · ' + m.organisation : '' }}{{ m.perms.lead ? ' · chef de room' : '' }}</small></div>
                  <div class="perms">
                    @for (p of permList; track p.key) {
                      <button type="button" class="perm" [class.on]="m.perms[p.key]" [disabled]="!r.me.lead || m.owner || m.perms.lead && p.key !== 'lead' || busy()"
                              [attr.aria-pressed]="m.perms[p.key]" (click)="toggle(m, p.key)" [title]="p.help">{{ p.label }}</button>
                    }
                  </div>
                  @if (r.me.lead && !m.owner && m.userId !== r.myId) { <button type="button" class="x" (click)="remove(m)" [attr.aria-label]="'Retirer ' + m.name">✕</button> }
                </li>
              }
            </ul>
          }
        }
      </section>
      @if (msg()) { <p class="ok" role="status">{{ msg() }}</p> }
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
    } @else if (notFound()) {
      <div class="empty"><h2>Room introuvable</h2><p>Elle a peut-être été fermée, ou vous n'en faites pas partie.</p></div>
    } @else { <div class="skel"></div> }
  </div>
  `,
  styles: [`
  :host { display: block; }
  .page { padding: 22px 32px 40px; max-width: 1060px; display: flex; flex-direction: column; gap: 16px; }
  .back { color: var(--text-muted); text-decoration: none; font-size: 13.5px; } .back:hover { color: var(--accent-ink); }
  .head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .kicker { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; color: var(--accent-ink); }
  .live { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 0 var(--accent); animation: live 2s ease-out infinite; }
  @keyframes live { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent); } 100% { box-shadow: 0 0 0 10px transparent; } }
  h1 { margin: 4px 0 2px; font-size: 36px; line-height: 1.05; font-stretch: 82%; }
  .ttl p { margin: 0; color: var(--text-muted); font-size: 14px; } .ttl p b { color: var(--text-primary); }
  .faces { display: flex; }
  .face { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-size: 11.5px; font-weight: 800; margin-left: -8px;
    border: 2px solid var(--bg-primary); background: var(--graphite-600); color: var(--paper); }
  .face[data-r="MARQUE"] { background: var(--rouge-400); } .face[data-r="AGENCE_MARKETING"] { background: var(--bleu-500); }
  .face[data-r="REALISATEUR"] { background: var(--vert-600); } .face[data-r="BOITE_PROD"] { background: var(--crayon-500); color: var(--graphite-900); }
  .face.more { background: var(--bg-secondary); color: var(--text-muted); }
  .face.big { width: 42px; height: 42px; margin: 0; font-size: 13px; flex: none; }
  .tabs { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--border); }
  .tabs button { position: relative; flex: none; height: 44px; padding: 0 14px; border: 0; background: none; color: var(--text-muted); font: inherit; font-size: 14.5px; font-weight: 600;
    cursor: pointer; display: inline-flex; align-items: center; gap: 7px; }
  .tabs button.on { color: var(--text-primary); }
  .tabs button.on::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 3px; border-radius: 3px 3px 0 0; background: var(--accent); animation: bar .25s ease-out; }
  @keyframes bar { from { transform: scaleX(.3); opacity: 0; } }
  .ti { display: inline-flex; } .ti :is(svg) { width: 17px; height: 17px; }
  .badge { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; display: grid; place-items: center; font-size: 11.5px; font-weight: 800; background: var(--accent); color: var(--on-accent); }
  .pane { animation: paneIn .28s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes paneIn { from { opacity: 0; transform: translateY(8px); } }
  .invite { display: flex; gap: 8px; }
  .invite input { flex: 1; min-width: 0; height: 42px; padding: 0 12px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--glass); color: var(--text-primary); font: inherit; }
  .invite input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .primary { height: 42px; padding: 0 18px; border-radius: 12px; border: 0; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 700; cursor: pointer; }
  .primary:disabled { opacity: .5; }
  .hint { margin: 8px 0 12px; font-size: 13px; color: var(--text-muted); }
  .team { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .team li { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--border); background: var(--glass); flex-wrap: wrap; }
  .mi { flex: 1 1 180px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .mi b { font-size: 14.5px; } .mi small { font-size: 12.5px; color: var(--text-muted); }
  .perms { display: flex; flex-wrap: wrap; gap: 5px; }
  .perm { height: 28px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--text-subtle);
    font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; transition: all .15s; }
  .perm.on { background: var(--accent-dim); border-color: var(--accent); color: var(--accent-ink); }
  .perm:disabled { cursor: default; }
  .perm:not(:disabled):active { transform: scale(.94); }
  .x { width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: var(--text-subtle); cursor: pointer; }
  .x:hover { color: var(--danger); background: var(--bg-hover); }
  .ok { color: var(--success); font-size: 13.5px; margin: 0; } .err { color: var(--danger); font-size: 13.5px; margin: 0; }
  .empty { padding: 40px 20px; text-align: center; border: 1px dashed var(--border); border-radius: 16px; }
  .skel { height: 260px; border-radius: 16px; background: linear-gradient(90deg, var(--glass), var(--bg-secondary), var(--glass)); background-size: 200% 100%; animation: sk 1.2s linear infinite; }
  @keyframes sk { to { background-position: -200% 0; } }
  @media (max-width: 760px) {
    /* Téléphone : en-tête compact pour que la carte à swiper tienne entière à l'écran. */
    .page { padding: 10px 14px 24px; gap: 10px; } .back { display: none; }
    h1 { font-size: 22px; margin: 2px 0 0; } .ttl p { font-size: 12.5px; } .faces { display: none; }
    .tabs button { padding: 0 10px; font-size: 13.5px; height: 40px; }
  }
  @media (prefers-reduced-motion: reduce) { .live, .pane, .tabs button.on::after { animation: none; } }
  `]
})
export class RoomComponent {
  private readonly api = inject(RoomService);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  readonly room = signal<Room | null>(null);
  readonly notFound = signal(false);
  readonly tab = signal<Tab>('swipe');
  readonly resultsRole = signal<string | null>(null);
  readonly busy = signal(false);
  readonly msg = signal('');
  readonly error = signal('');
  email = '';

  readonly permList: { key: keyof RoomPerms; label: string; help: string }[] = [
    { key: 'swipe', label: 'Swipe', help: 'Peut swiper les candidats' },
    { key: 'results', label: 'Résultats', help: 'Voit le tableau des résultats' },
    { key: 'docs', label: 'Documents', help: 'Partage et met à jour les documents' },
    { key: 'tasks', label: 'Tâches', help: 'Crée et répartit les tâches' },
    { key: 'lead', label: 'Chef de room', help: 'Dirige la room : équipe, autorisations, choix finaux' }
  ];

  private readonly icons: Record<Tab, string> = {
    swipe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="16" rx="2.5" transform="rotate(8 12 11)"/><path d="M3 20h4"/></svg>',
    resultats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    documents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
    taches: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 7 2 2 4-4M4 17l2 2 4-4M13 7h7M13 17h7"/></svg>',
    equipe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 5.5 5"/></svg>'
  };
  readonly tabs = computed(() => {
    const r = this.room(); if (!r) return [];
    const toSwipe = r.roles.reduce((a, x) => a + x.toSwipe, 0), matches = r.roles.reduce((a, x) => a + x.matches, 0);
    const all: { id: Tab; label: string; badge: number; show: boolean }[] = [
      { id: 'swipe', label: 'Swipe', badge: toSwipe, show: r.me.swipe },
      { id: 'resultats', label: 'Résultats', badge: matches, show: r.me.results },
      { id: 'documents', label: 'Documents', badge: 0, show: true },
      { id: 'taches', label: 'Tâches', badge: r.tasksOpen, show: true },
      { id: 'equipe', label: 'Équipe', badge: 0, show: true }
    ];
    return all.filter(t => t.show).map(t => ({ ...t, icon: this.icons[t.id] }));
  });

  constructor() { this.load(true); }

  private load(first = false): void {
    this.api.get(this.id).subscribe({
      next: r => {
        this.room.set(r);
        if (first && !r.me.swipe) this.tab.set(r.me.results ? 'resultats' : 'documents');
      },
      error: () => this.notFound.set(true)
    });
  }
  reload(): void { this.load(); }
  go(t: Tab): void { this.tab.set(t); this.msg.set(''); this.error.set(''); if (t !== 'resultats') this.resultsRole.set(null); }
  openResults(roleId: string): void { this.resultsRole.set(roleId); this.tab.set('resultats'); this.load(); }

  invite(): void {
    this.busy.set(true); this.error.set(''); this.msg.set('');
    this.api.invite(this.id, this.email.trim()).subscribe({
      next: r => { this.room.set(r); this.busy.set(false); this.msg.set('Invitation envoyée : le membre est prévenu.'); this.email = ''; },
      error: e => { this.busy.set(false); this.error.set(e.error?.message ?? 'Invitation impossible.'); }
    });
  }
  toggle(m: RoomMember, key: keyof RoomPerms): void {
    this.busy.set(true); this.error.set('');
    this.api.setPerms(this.id, m.userId, { [key]: !m.perms[key] }).subscribe({
      next: r => { this.room.set(r); this.busy.set(false); },
      error: e => { this.busy.set(false); this.error.set(e.error?.message ?? 'Modification impossible.'); }
    });
  }
  remove(m: RoomMember): void {
    this.api.removeMember(this.id, m.userId).subscribe({ next: r => { this.room.set(r); this.msg.set(m.name + ' a quitté la room.'); } });
  }
  side(r: string): string { return SIDE_LABEL[r] ?? r; }
  initials(n: string): string { return n.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
}
