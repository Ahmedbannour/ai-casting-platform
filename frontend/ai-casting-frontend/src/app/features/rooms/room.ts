import { Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { FicheComponent } from '../fiche/fiche';
import { LiveService } from '../../core/services/live.service';
import { BrandService } from '../../core/services/brand.service';
import { DomSanitizer } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Room, RoomMember, RoomPerms, RoomService, SIDE_LABEL } from '../../core/services/room.service';
import { RoomSwipeComponent } from './room-swipe';
import { RoomResultsComponent } from './room-results';
import { RoomDocsComponent } from './room-docs';
import { RoomTasksComponent } from './room-tasks';
import { ShareLinkComponent } from '../../shared/components/share-link/share-link';
import { ProductionService } from '../../core/services/production.service';

type Tab = 'fiche' | 'swipe' | 'resultats' | 'documents' | 'taches' | 'equipe';

/**
 * Room de casting d'un projet. La production la dirige ; chacun ne voit que les onglets que le chef de room lui ouvre :
 * swipe des candidats, tableau des résultats, documents partagés, tâches, équipe et autorisations.
 */
@Component({
  selector: 'app-room',
  standalone: true,
  imports: [RouterLink, FormsModule, FicheComponent, RoomSwipeComponent, RoomResultsComponent, RoomDocsComponent, RoomTasksComponent, ShareLinkComponent],
  template: `
  <div class="page">
    <a class="back" routerLink="/rooms">← Mes rooms</a>
    @if (room(); as r) {
      <header class="head">
        <div class="ttl">
          <span class="kicker">
            @if (brandSvc.logoSrc(r.brand); as src) { <img class="brand-logo org" [src]="src" alt="" /> } @else { <i class="live" aria-hidden="true"></i> }
            Room de casting{{ r.brand ? ' · ' + r.brand.name : '' }}</span>
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
          @case ('fiche') { <app-fiche [roomId]="r.id" /> }
          @case ('swipe') { <app-room-swipe [roomId]="r.id" [roles]="r.roles" (voted)="reload()" (showResults)="openResults($event)" /> }
          @case ('resultats') { <app-room-results [roomId]="r.id" [roles]="r.roles" [lead]="r.me.lead" [startRole]="resultsRole()" /> }
          @case ('documents') { <app-room-docs [roomId]="r.id" [canEdit]="r.me.docs" /> }
          @case ('taches') { <app-room-tasks [roomId]="r.id" [members]="r.members" [canEdit]="r.me.tasks" [myId]="r.myId" /> }
          @case ('equipe') {
            @if (r.me.lead) {
              <form class="invite" (ngSubmit)="invite()">
                <input name="email" type="email" [(ngModel)]="email" (ngModelChange)="askRole.set(false); link.set(null)" placeholder="E-mail du membre à inviter" aria-label="E-mail du membre à inviter" inputmode="email" />
                <button type="submit" class="primary" [disabled]="busy() || !email.trim()">Inviter</button>
              </form>
              @if (askRole()) {
                <div class="ext" role="group" aria-label="Rôle de la personne invitée">
                  <p>{{ email.trim() }} n'a pas encore de compte sur Cercle. Elle rejoindra la room comme :</p>
                  <div class="kinds">
                    @for (k of kinds; track k.key) {
                      <button type="button" class="kind" [class.on]="kind() === k.key" [attr.aria-pressed]="kind() === k.key" (click)="kind.set(k.key)">{{ k.label }}</button>
                    }
                  </div>
                  <button type="button" class="primary" (click)="invite()" [disabled]="busy() || !kind()">Créer le lien d'invitation</button>
                </div>
              }
              @if (link(); as l) {
                <app-share-link [link]="l.link" [email]="l.email" [subject]="'Rejoignez la room « ' + r.title + ' » sur Cercle'"
                  [message]="'Bonjour, je vous invite dans la room de casting « ' + r.title + ' » sur Cercle. Créez votre compte en une minute :'" />
              }
            }
            <div class="groups">
              @for (g of groups(r.members); track g.key) {
                <section class="grp" [attr.aria-label]="g.label">
                  <h3><span class="gdot" [attr.data-r]="g.key"></span>{{ g.label }} <em>{{ g.members.length }}</em></h3>
                  <ul class="mems">
                    @for (m of g.members; track m.userId) {
                      @let pr = preset(m);
                      @let editable = r.me.lead && !m.owner && m.userId !== r.myId;
                      <li class="mem" [class.open]="openMember() === m.userId">
                        <div class="row">
                          <span class="face big" [attr.data-r]="m.role">{{ initials(m.name) }}</span>
                          <div class="mi"><b>{{ m.name }} @if (m.userId === r.myId) { <small class="you">vous</small> }</b>
                            <small>{{ side(m.role) }}{{ m.organisation ? ' · ' + m.organisation : '' }}</small></div>
                          @if (editable) {
                            <button type="button" class="access" [attr.data-p]="pr.key" (click)="openMember.set(openMember() === m.userId ? null : m.userId)"
                                    [attr.aria-expanded]="openMember() === m.userId" [attr.aria-label]="'Accès de ' + m.name + ' : ' + pr.label">
                              <span class="aico" [innerHTML]="pr.icon"></span>{{ pr.label }}
                              <svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
                            </button>
                          } @else {
                            <span class="access ro" [attr.data-p]="m.owner ? 'LEAD' : pr.key"><span class="aico" [innerHTML]="(m.owner ? presets[0] : pr).icon"></span>{{ m.owner ? 'Propriétaire' : pr.label }}</span>
                          }
                        </div>
                        @if (openMember() === m.userId) {
                          <div class="panel">
                            <div class="presets" role="radiogroup" [attr.aria-label]="'Niveau d’accès de ' + m.name">
                              @for (x of presets; track x.key) {
                                <button type="button" role="radio" class="pcard" [class.on]="pr.key === x.key" [attr.aria-checked]="pr.key === x.key"
                                        [disabled]="busy()" (click)="applyPreset(m, x.key)">
                                  <span class="aico" [innerHTML]="x.icon"></span><b>{{ x.label }}</b><small>{{ x.help }}</small>
                                </button>
                              }
                            </div>
                            <p class="fine-t">Réglage fin</p>
                            <div class="fine">
                              @for (p of permList; track p.key) {
                                @if (p.key !== 'lead') {
                                  <label class="sw-row" [class.dim]="m.perms.lead">
                                    <span><b>{{ p.label }}</b><small>{{ p.help }}</small></span>
                                    <button type="button" role="switch" class="switch" [attr.aria-checked]="m.perms[p.key]" [class.on]="m.perms[p.key]"
                                            [disabled]="busy() || m.perms.lead" (click)="toggle(m, p.key)" [attr.aria-label]="p.label"><i></i></button>
                                  </label>
                                }
                              }
                            </div>
                            <div class="panel-foot">
                              @if (m.perms.lead) { <span class="muted">Le chef de room a tous les accès.</span> }
                              <button type="button" class="leave" (click)="remove(m)" [disabled]="busy()">Retirer de la room</button>
                            </div>
                          </div>
                        }
                      </li>
                    }
                  </ul>
                </section>
              }
            </div>
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
  .kicker .org { width: 22px; height: 22px; border-radius: 6px; object-fit: contain; background: var(--bg-surface); }
  .kicker { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; color: var(--accent-ink); }
  .live { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 0 var(--accent); animation: live 2s ease-out infinite; }
  @keyframes live { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent); } 100% { box-shadow: 0 0 0 10px transparent; } }
  h1 { margin: 4px 0 2px; font-size: 36px; line-height: 1.05; font-stretch: 82%; }
  .ttl p { margin: 0; color: var(--text-muted); font-size: 14px; } .ttl p b { color: var(--text-primary); }
  .faces { display: flex; }
  .face { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-size: 11.5px; font-weight: 800; margin-left: -8px;
    border: 2px solid var(--bg-primary); background: var(--graphite-600); color: var(--paper); }
  .face[data-r="MARQUE"] { background: var(--rouge-400); } .face[data-r="AGENCE_MARKETING"] { background: var(--bleu-500); }
  .face[data-r="REALISATEUR"] { background: var(--vert-600); } .face[data-r="BOITE_PROD"], .face[data-r="ASSISTANT_PROD"] { background: var(--crayon-500); color: var(--graphite-900); }
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
  .ext { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
    background: color-mix(in srgb, var(--accent) 7%, var(--glass)); animation: extIn .3s cubic-bezier(.2,.8,.2,1) both; }
  .ext p { margin: 0; font-size: 14px; color: var(--text-primary); }
  .ext .primary { align-self: flex-start; }
  .kinds { display: flex; flex-wrap: wrap; gap: 6px; }
  .kind { height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--text-muted);
    font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
  .kind.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent, #111); }
  @keyframes extIn { from { opacity: 0; transform: translateY(-4px); } }
  .invite input { flex: 1; min-width: 0; height: 42px; padding: 0 12px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--glass); color: var(--text-primary); font: inherit; }
  .invite input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .primary { height: 42px; padding: 0 18px; border-radius: 12px; border: 0; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 700; cursor: pointer; }
  .primary:disabled { opacity: .5; }
  .hint { margin: 8px 0 12px; font-size: 13px; color: var(--text-muted); }
  /* Équipe : par côté, un niveau d'accès lisible, le détail dans une fiche dépliable */
  .groups { display: flex; flex-direction: column; gap: 18px; margin-top: 14px; }
  .grp h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 13px; font-weight: 700; color: var(--text-muted); letter-spacing: .01em; }
  .grp h3 em { font-style: normal; font-size: 11.5px; padding: 1px 7px; border-radius: 999px; background: var(--bg-hover); color: var(--text-subtle); }
  .gdot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-subtle); }
  .gdot[data-r="PROD"] { background: var(--accent); } .gdot[data-r="REALISATEUR"] { background: var(--vert-600); }
  .gdot[data-r="MARQUE"] { background: var(--rouge-400); } .gdot[data-r="AGENCE_MARKETING"] { background: var(--bleu-500); }
  .mems { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(380px, 100%), 1fr)); gap: 8px; }
  .mem { border-radius: 16px; border: 1px solid var(--border); background: var(--glass); transition: border-color .2s, box-shadow .2s; }
  .mem.open { grid-column: 1 / -1; border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); box-shadow: 0 10px 30px rgba(0,0,0,.18); }
  .mem .row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; min-width: 0; }
  .mi { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .mi b { font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mi small { font-size: 12.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .you { margin-left: 4px; padding: 1px 7px; border-radius: 999px; background: var(--bg-hover); color: var(--text-muted); font-size: 11px; font-weight: 600; }
  .access { flex: none; display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 10px 0 9px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-primary); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
    transition: border-color .15s, background .15s; }
  button.access:hover { border-color: var(--accent); }
  .access.ro { cursor: default; color: var(--text-muted); background: transparent; }
  .access[data-p="LEAD"] { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .access[data-p="COLLAB"] { border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); }
  .access .chev { transition: transform .25s cubic-bezier(.2,.8,.2,1); opacity: .7; }
  .access[aria-expanded="true"] .chev { transform: rotate(180deg); }
  .aico { display: inline-grid; place-items: center; width: 16px; height: 16px; }
  .panel { padding: 4px 14px 14px; display: flex; flex-direction: column; gap: 10px; animation: panelIn .25s cubic-bezier(.2,.8,.2,1) both; }
  .presets { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr)); gap: 8px; }
  .pcard { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; row-gap: 2px; align-items: center; text-align: left; padding: 11px 12px;
    border-radius: 12px; border: 1px solid var(--border); background: transparent; color: var(--text-primary); font: inherit; cursor: pointer;
    transition: border-color .15s, background .15s, transform .15s; }
  .pcard:hover { border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); }
  .pcard:active { transform: scale(.98); }
  .pcard b { font-size: 14px; } .pcard small { grid-column: 1 / -1; font-size: 12px; color: var(--text-muted); line-height: 1.35; }
  .pcard.on { border-color: var(--accent); background: var(--accent-dim); }
  .pcard.on .aico { color: var(--accent-ink); }
  .fine-t { margin: 4px 0 0; font-size: 12.5px; font-weight: 700; color: var(--text-subtle); }
  .fine { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: 6px 16px; }
  .sw-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
  .sw-row.dim { opacity: .55; }
  .sw-row span { display: flex; flex-direction: column; min-width: 0; } .sw-row b { font-size: 13.5px; } .sw-row small { font-size: 12px; color: var(--text-muted); }
  .switch { flex: none; position: relative; width: 40px; height: 24px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-hover); cursor: pointer; padding: 0;
    transition: background .2s, border-color .2s; }
  .switch i { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--text-muted); transition: transform .25s cubic-bezier(.2,1.3,.4,1), background .2s; }
  .switch.on { background: var(--accent); border-color: var(--accent); }
  .switch.on i { transform: translateX(16px); background: var(--on-accent); }
  .switch:disabled { cursor: default; }
  .panel-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .panel-foot .muted { font-size: 12.5px; color: var(--text-muted); }
  .leave { margin-left: auto; height: 34px; padding: 0 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--danger) 40%, var(--border));
    background: transparent; color: var(--danger); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .leave:hover { background: color-mix(in srgb, var(--danger) 10%, transparent); }
  @keyframes panelIn { from { opacity: 0; transform: translateY(-4px); } }
  @media (max-width: 560px) { .access { padding: 0 8px; font-size: 12px; } .mem .row { gap: 10px; } }
  @media (prefers-reduced-motion: reduce) { .panel, .switch i, .access .chev { animation: none; transition: none; } }
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
    .tabs button { padding: 0 10px; font-size: 13.5px; height: 44px; }
  }
  @media (prefers-reduced-motion: reduce) { .live, .pane, .tabs button.on::after { animation: none; } }
  `]
})
export class RoomComponent implements OnDestroy {
  readonly brandSvc = inject(BrandService);
  private readonly api = inject(RoomService);
  private readonly route = inject(ActivatedRoute);
  private readonly id = this.route.snapshot.paramMap.get('id')!;
  readonly room = signal<Room | null>(null);
  readonly notFound = signal(false);
  readonly tab = signal<Tab>('fiche');
  readonly resultsRole = signal<string | null>(null);
  readonly busy = signal(false);
  readonly msg = signal('');
  readonly error = signal('');
  email = '';

  readonly permList: { key: keyof RoomPerms; label: string; help: string }[] = [
    { key: 'swipe', label: 'Voter', help: 'Swipe les candidats : non, oui, coup de cœur' },
    { key: 'results', label: 'Voir les résultats', help: 'Le classement et les matchs' },
    { key: 'docs', label: 'Documents', help: 'Partage et met à jour les fichiers' },
    { key: 'tasks', label: 'Tâches', help: 'Crée et répartit les tâches' },
    { key: 'lead', label: 'Chef de room', help: 'Dirige la room : équipe, autorisations, choix finaux' }
  ];

  private readonly icons: Record<Tab, string> = {
    fiche: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h4"/></svg>',
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
      { id: 'fiche', label: 'Fiche', badge: 0, show: true },
      { id: 'swipe', label: 'Swipe', badge: toSwipe, show: r.me.swipe },
      { id: 'resultats', label: 'Résultats', badge: matches, show: r.me.results },
      { id: 'documents', label: 'Documents', badge: 0, show: true },
      { id: 'taches', label: 'Tâches', badge: r.tasksOpen, show: true },
      { id: 'equipe', label: 'Équipe', badge: 0, show: true }
    ];
    return all.filter(t => t.show).map(t => ({ ...t, icon: this.icons[t.id] }));
  });

  constructor() {
    this.load(true);
    // Votes, matchs, tâches, équipe : la room suit l'activité des autres sans recharger
    inject(LiveService).watch(inject(DestroyRef), () => this.load());
  }
  ngOnDestroy(): void { this.brandSvc.restore(); }

  private load(first = false): void {
    this.api.get(this.id).subscribe({
      next: r => {
        this.room.set(r);
        if (first) this.brandSvc.show(r.brand ?? this.brandSvc.own());   // la room porte les couleurs de la boîte qui la dirige
        // La room s'ouvre sur la fiche du projet ; ?tab=swipe (etc.) ouvre un autre espace
        if (first) { const want = this.route.snapshot.queryParamMap.get('tab') as Tab | null; if (want && this.tabs().some(t => t.id === want)) this.tab.set(want); }
      },
      error: () => this.notFound.set(true)
    });
  }
  reload(): void { this.load(); }
  go(t: Tab): void { this.tab.set(t); this.msg.set(''); this.error.set(''); if (t !== 'resultats') this.resultsRole.set(null); }
  openResults(roleId: string): void { this.resultsRole.set(roleId); this.tab.set('resultats'); this.load(); }

  /** Personne invitée sans compte : son rôle, puis un lien à envoyer. */
  readonly kinds = [{ key: 'REALISATEUR', label: 'Réalisateur' }, { key: 'MARQUE', label: 'Marque' }, { key: 'AGENCE_MARKETING', label: 'Agence marketing' }];
  readonly askRole = signal(false);
  readonly kind = signal<string | null>(null);
  readonly link = signal<{ link: string; email: string } | null>(null);

  invite(): void {
    const mail = this.email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(mail)) { this.error.set('Indiquez une adresse e-mail valide.'); return; }
    this.busy.set(true); this.error.set(''); this.msg.set('');
    this.api.inviteByEmail(this.id, mail, this.askRole() ? this.kind() ?? undefined : undefined).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status === 'ROLE') { this.askRole.set(true); this.kind.set(null); return; }
        if (r.status === 'LIEN' && r.token) { this.link.set({ link: ProductionService.link(r.token), email: mail }); this.askRole.set(false); this.email = ''; return; }
        this.msg.set(r.message); this.email = ''; this.askRole.set(false); this.load();
      },
      error: e => { this.busy.set(false); this.error.set(e.error?.message ?? 'Invitation impossible.'); }
    });
  }
  // ── Équipe : niveaux d'accès ──
  private readonly sanitizer = inject(DomSanitizer);
  readonly openMember = signal<string | null>(null);
  private ic(d: string) { return this.sanitizer.bypassSecurityTrustHtml(`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`); }
  readonly presets = [
    { key: 'LEAD', label: 'Chef de room', help: 'Dirige la room : équipe, accès, choix finaux', icon: this.ic('<path d="m3 8 4 4 5-7 5 7 4-4-2 11H5z"/>'),
      perms: { lead: true, swipe: true, results: true, docs: true, tasks: true } },
    { key: 'COLLAB', label: 'Collaborateur', help: 'Vote, voit les résultats, documents et tâches', icon: this.ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="m16 11 2 2 4-4"/>'),
      perms: { lead: false, swipe: true, results: true, docs: true, tasks: true } },
    { key: 'VOTE', label: 'Votant', help: 'Swipe les candidats et voit les résultats', icon: this.ic('<path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.4 21H7V10l4-8a3 3 0 0 1 4 3.9z"/>'),
      perms: { lead: false, swipe: true, results: true, docs: false, tasks: false } },
    { key: 'VIEW', label: 'Spectateur', help: 'Voit seulement le classement des candidats', icon: this.ic('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
      perms: { lead: false, swipe: false, results: true, docs: false, tasks: false } }
  ];
  private readonly custom = { key: 'CUSTOM', label: 'Sur mesure', help: '', icon: this.ic('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'), perms: null };
  preset(m: RoomMember) {
    const p = m.perms;
    return this.presets.find(x => (x.key === 'LEAD' && p.lead) || (!p.lead && x.key !== 'LEAD'
      && x.perms.swipe === p.swipe && x.perms.results === p.results && x.perms.docs === p.docs && x.perms.tasks === p.tasks)) ?? this.custom;
  }
  applyPreset(m: RoomMember, key: string): void {
    const x = this.presets.find(p => p.key === key); if (!x) return;
    this.busy.set(true); this.error.set(''); this.msg.set('');
    this.api.setPerms(this.id, m.userId, x.perms).subscribe({
      next: r => { this.room.set(r); this.busy.set(false); this.msg.set('Accès de ' + m.name + ' : ' + x.label + '.'); },
      error: e => { this.busy.set(false); this.error.set(e.error?.message ?? 'Modification impossible.'); }
    });
  }
  groups(members: RoomMember[]) {
    const order = [['PROD', 'Production'], ['REALISATEUR', 'Réalisation'], ['MARQUE', 'Marque'], ['AGENCE_MARKETING', 'Agence marketing']];
    const key = (r: string) => r === 'BOITE_PROD' || r === 'ASSISTANT_PROD' || r === 'ADMIN' ? 'PROD' : r;
    return order.map(([k, label]) => ({ key: k, label, members: members.filter(m => key(m.role) === k) })).filter(g => g.members.length);
  }

  toggle(m: RoomMember, key: keyof RoomPerms): void {
    this.busy.set(true); this.error.set('');
    this.api.setPerms(this.id, m.userId, { [key]: !m.perms[key] }).subscribe({
      next: r => { this.room.set(r); this.busy.set(false); },
      error: e => { this.busy.set(false); this.error.set(e.error?.message ?? 'Modification impossible.'); }
    });
  }
  remove(m: RoomMember): void {
    this.openMember.set(null);
    this.api.removeMember(this.id, m.userId).subscribe({ next: r => { this.room.set(r); this.msg.set(m.name + ' a quitté la room.'); } });
  }
  side(r: string): string { return SIDE_LABEL[r] ?? r; }
  initials(n: string): string { return n.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
}
