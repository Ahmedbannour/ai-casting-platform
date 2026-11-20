import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MeService } from '../../core/services/me.service';
import { AgendaItem, AgendaService } from '../../core/services/agenda.service';
import { DAYS_FR, MONTHS_SHORT_FR, addDays, fromIso, todayIso } from '../../shared/forms/dates';

interface RoleToFill { id: string; name: string; projectId: string; projectTitle: string; importance: string; shootStart: string | null;
  preselected: number; audition: number; callback: number; chosen: number; }
interface Pending { offerId: string; kind: 'AUDITION' | 'PROPOSITION'; roleId: string; roleName: string; actorName: string; sentAt: number; auditionDate: string | null; }
interface Answer { roleId: string; roleName: string; actorName: string; kind: string; status: 'ACCEPTEE' | 'DECLINEE'; answeredAt: number; note: string | null; }
interface Home { activeProjects: number; openRoles: number; filledRoles: number; pendingCount: number; answers7d: number;
  rolesToFill: RoleToFill[]; pending: Pending[]; answers: Answer[]; }

/**
 * T-143 · Accueil de l'agent : la semaine d'auditions, ce qui attend la réponse des acteurs,
 * les rôles à pourvoir avec l'avancement de leur shortlist, et les dernières réponses.
 */
@Component({
  selector: 'app-agent-home',
  standalone: true,
  imports: [RouterLink],
  template: `
  <div class="page">
    <header class="head">
      <div>
        <p class="hello">{{ greeting() }}@if (agency()) { · {{ agency() }} }</p>
        <h1>{{ firstName() || 'Accueil' }}</h1>
        @if (contractNote(); as c) { <p class="contract" [class.warn]="c.warn">{{ c.text }}</p> }
      </div>
      <div class="cta">
        <a class="btn ghost" routerLink="/projects">Mes projets</a>
        <a class="btn" routerLink="/chat">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          Nouvelle recherche
        </a>
      </div>
    </header>

    @if (loading()) {
      <div class="tiles">@for (i of [1,2,3,4]; track i) { <div class="tile skel"></div> }</div>
    } @else if (error()) {
      <p class="field-msg" role="alert">{{ error() }}</p>
    } @else if (h(); as d) {
      <section class="tiles" aria-label="En un coup d’œil">
        <a class="tile" routerLink="/agenda" [class.hot]="week().length">
          <span class="k">Auditions · 7 jours</span><b class="n">{{ week().length }}</b>
          <span class="s">{{ todayCount() ? todayCount() + ' aujourd’hui' : (week().length ? 'à venir cette semaine' : 'Aucune cette semaine') }}</span>
        </a>
        <a class="tile" [class.hot]="d.pendingCount" href="#attente" (click)="jump($event, 'attente')">
          <span class="k">Réponses attendues</span><b class="n">{{ d.pendingCount }}</b>
          <span class="s">{{ d.pendingCount ? 'acteurs n’ont pas encore répondu' : 'Personne à relancer' }}</span>
        </a>
        <a class="tile" href="#roles" (click)="jump($event, 'roles')">
          <span class="k">Rôles à pourvoir</span><b class="n">{{ d.openRoles }}</b>
          <span class="s">{{ d.filledRoles }} pourvu{{ d.filledRoles > 1 ? 's' : '' }} · {{ d.activeProjects }} projet{{ d.activeProjects > 1 ? 's' : '' }} en cours</span>
        </a>
        <a class="tile" href="#reponses" (click)="jump($event, 'reponses')">
          <span class="k">Réponses · 7 jours</span><b class="n">{{ d.answers7d }}</b>
          <span class="s">{{ accepted() }} acceptée{{ accepted() > 1 ? 's' : '' }} · {{ declined() }} déclinée{{ declined() > 1 ? 's' : '' }}</span>
        </a>
      </section>

      <div class="cols">
        <section class="block" aria-labelledby="h-week">
          <div class="bh"><h2 id="h-week">Cette semaine</h2><a routerLink="/agenda">Agenda</a></div>
          @if (week().length) {
            <ul class="week">
              @for (it of week(); track it.entryId + it.pending) {
                <li [class.pending]="it.pending">
                  <span class="when"><b>{{ dayLabel(it.date) }}</b><span>{{ it.time ? hm(it.time) : '—' }}</span></span>
                  <a [routerLink]="['/roles', it.roleId]" class="what"><b>{{ it.actorName }}</b><span>{{ it.roleName }}@if (it.place) { · {{ it.place }} }</span></a>
                  <span class="pill" [class.wait]="it.pending">{{ it.pending ? 'À confirmer' : 'Confirmée' }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="empty">Aucune audition dans les 7 jours. Convoquez un candidat depuis la shortlist d’un rôle.</p>
          }
        </section>

        <section class="block" id="attente" aria-labelledby="h-wait">
          <div class="bh"><h2 id="h-wait">En attente de réponse</h2></div>
          @if (d.pending.length) {
            <ul class="wait">
              @for (o of d.pending; track o.offerId) {
                <li>
                  <span class="badge" [class.aud]="o.kind === 'AUDITION'">{{ o.kind === 'AUDITION' ? 'Audition' : 'Rôle' }}</span>
                  <a [routerLink]="['/roles', o.roleId]" class="what"><b>{{ o.actorName }}</b><span>{{ o.roleName }}</span></a>
                  <span class="age" [class.old]="days(o.sentAt) >= 3">{{ since(o.sentAt) }}</span>
                </li>
              }
            </ul>
            @if (d.pendingCount > d.pending.length) { <p class="more">et {{ d.pendingCount - d.pending.length }} autre(s)</p> }
          } @else {
            <p class="empty">Toutes vos demandes ont reçu une réponse.</p>
          }
        </section>
      </div>

      <section class="block" id="roles" aria-labelledby="h-roles">
        <div class="bh"><h2 id="h-roles">Rôles à pourvoir</h2><a routerLink="/projects">Tous les projets</a></div>
        @if (d.rolesToFill.length) {
          <div class="roles">
            @for (r of d.rolesToFill; track r.id) {
              <article class="role">
                <div class="r-top">
                  <span class="imp" [attr.data-i]="r.importance">{{ imp(r.importance) }}</span>
                  @if (r.shootStart) { <span class="shoot" [class.soon]="daysTo(r.shootStart) <= 21">Tournage {{ untilLabel(r.shootStart) }}</span> }
                </div>
                <a [routerLink]="['/roles', r.id]" class="r-name"><h3>{{ r.name }}</h3></a>
                <p class="r-proj">{{ r.projectTitle }}</p>
                <div class="bar" role="img" [attr.aria-label]="barLabel(r)">
                  @if (total(r)) {
                    <i class="b1" [style.flex]="r.preselected"></i><i class="b2" [style.flex]="r.audition"></i><i class="b3" [style.flex]="r.callback"></i><i class="b4" [style.flex]="r.chosen"></i>
                  } @else { <i class="b0"></i> }
                </div>
                <p class="legend">{{ total(r) ? barLabel(r) : 'Shortlist vide' }}</p>
                <div class="r-act">
                  <a class="btn sm" [routerLink]="['/roles', r.id]">{{ r.chosen ? 'Finaliser' : total(r) ? 'Ouvrir la shortlist' : 'Ouvrir le rôle' }}</a>
                  <a class="btn sm ghost" routerLink="/chat" [queryParams]="{ role: r.id }">Trouver des acteurs</a>
                </div>
              </article>
            }
          </div>
        } @else {
          <p class="empty">Aucun rôle à pourvoir. Créez un projet et décrivez ses rôles : l’IA vous proposera des profils.</p>
        }
      </section>

      <section class="block" id="reponses" aria-labelledby="h-ans">
        <div class="bh"><h2 id="h-ans">Dernières réponses</h2></div>
        @if (d.answers.length) {
          <ul class="answers">
            @for (a of d.answers; track $index) {
              <li [attr.data-s]="a.status">
                <span class="dot" aria-hidden="true"></span>
                <a [routerLink]="['/roles', a.roleId]" class="what"><b>{{ a.actorName }} {{ a.status === 'ACCEPTEE' ? 'a accepté' : 'a décliné' }}</b>
                  <span>{{ a.kind === 'AUDITION' ? 'Convocation' : 'Proposition' }} · {{ a.roleName }}@if (a.note) { · « {{ a.note }} » }</span></a>
                <time>{{ ago(a.answeredAt) }}</time>
              </li>
            }
          </ul>
        } @else {
          <p class="empty">Les réponses des acteurs à vos propositions et convocations s’afficheront ici.</p>
        }
      </section>
    }
  </div>
  `,
  styles: [`
  :host { display: block; }
  .page { max-width: 1120px; padding: 28px 32px 48px; display: flex; flex-direction: column; gap: 18px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
  .hello { color: var(--text-muted); font-size: 14px; }
  h1 { font-size: 40px; line-height: 1.05; margin-top: 2px; }
  .contract { margin-top: 6px; font-size: 13px; color: var(--text-muted); &.warn { color: var(--accent-ink); font-weight: 600; } }
  .cta { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: var(--radius-s); border: 1px solid transparent;
    background: var(--accent); color: var(--on-accent); font-size: 14px; font-weight: 700; text-decoration: none; white-space: nowrap;
    &:hover { background: var(--accent-hover); } &.ghost { background: var(--glass); border-color: var(--border); color: var(--text-primary); &:hover { border-color: var(--accent); } }
    &.sm { height: 32px; padding: 0 12px; font-size: 12.5px; } &:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; } }
  .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .tile { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; border-radius: var(--radius-l); border: 1px solid var(--border);
    background: var(--glass); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); color: inherit; text-decoration: none; min-height: 122px;
    transition: border-color .15s, transform .15s; &:hover { border-color: var(--accent); transform: translateY(-2px); } &:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; } }
  .tile.hot { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--glass)); }
  .skel { background: var(--bg-hover); border: none; }
  .k { font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
  .n { font-size: 40px; line-height: 1; font-weight: 800; font-variant-numeric: tabular-nums; }
  .s { font-size: 13px; color: var(--text-muted); line-height: 1.4; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
  .block { padding: 16px 18px; border-radius: var(--radius-l); border: 1px solid var(--border); background: var(--glass);
    -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); scroll-margin-top: 16px; }
  .bh { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 10px;
    h2 { font-size: 18px; font-stretch: 100%; } a { font-size: 13px; color: var(--accent-ink); } }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .what { display: flex; flex-direction: column; min-width: 0; color: inherit; text-decoration: none;
    b { font-size: 14.5px; } span { font-size: 13px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    &:hover b { text-decoration: underline; } }
  .week li, .wait li, .answers li { display: grid; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border); }
  .week li:first-child, .wait li:first-child, .answers li:first-child { border-top: none; }
  .week li { grid-template-columns: 92px 1fr auto; }
  .when { display: flex; flex-direction: column; b { font-size: 13.5px; } span { font-size: 13px; color: var(--accent-ink); font-weight: 700; font-variant-numeric: tabular-nums; } }
  .week li.pending .when span { color: var(--text-muted); }
  .pill { font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: var(--accent-dim); white-space: nowrap; &.wait { background: var(--bg-hover); color: var(--text-muted); } }
  .wait li { grid-template-columns: auto 1fr auto; }
  .badge { font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: var(--bg-hover); color: var(--text-muted); &.aud { background: var(--accent); color: var(--on-accent); } }
  .age { font-size: 12.5px; color: var(--text-muted); white-space: nowrap; &.old { color: var(--danger); font-weight: 600; } }
  .more { margin-top: 6px; font-size: 13px; color: var(--text-muted); }
  .roles { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  .role { display: flex; flex-direction: column; gap: 6px; padding: 14px; border-radius: var(--radius-m); border: 1px solid var(--border); background: var(--bg-surface); }
  .r-top { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
  .imp { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--bg-hover); color: var(--text-muted);
    &[data-i="PRINCIPAL"] { background: var(--accent); color: var(--on-accent); } }
  .shoot { font-size: 12px; color: var(--text-muted); &.soon { color: var(--accent-ink); font-weight: 700; } }
  .r-name { color: inherit; text-decoration: none; h3 { font-size: 18px; line-height: 1.2; } &:hover h3 { text-decoration: underline; } }
  .r-proj { font-size: 13px; color: var(--text-muted); }
  .bar { display: flex; gap: 2px; height: 8px; border-radius: 999px; overflow: hidden; margin-top: 4px; background: var(--bg-hover);
    i { display: block; min-width: 0; } .b1 { background: color-mix(in srgb, var(--accent) 35%, var(--bg-hover)); } .b2 { background: color-mix(in srgb, var(--accent) 65%, var(--bg-hover)); }
    .b3 { background: var(--accent); } .b4 { background: var(--success); } .b0 { flex: 1; } }
  .legend { font-size: 12px; color: var(--text-muted); }
  .r-act { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .answers li { grid-template-columns: 10px 1fr auto; }
  .answers .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--success); }
  .answers li[data-s="DECLINEE"] .dot { background: var(--text-subtle); }
  time { font-size: 12px; color: var(--text-subtle); white-space: nowrap; }
  .empty { color: var(--text-muted); font-size: 14px; line-height: 1.55; }
  @container page (max-width: 900px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cols { grid-template-columns: 1fr; } }
  @container page (max-width: 560px) {
    .page { padding: 20px 16px 32px; } h1 { font-size: 32px; } .tile { min-height: 0; } .n { font-size: 32px; }
    .week li { grid-template-columns: 1fr auto; } .week .when { grid-column: 1 / -1; flex-direction: row; gap: 8px; }
    .cta { width: 100%; } .cta .btn { flex: 1; justify-content: center; }
  }
  @media (prefers-reduced-motion: reduce) { .tile { transition: none; } .tile:hover { transform: none; } }
  `]
})
export class AgentHomeComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly meService = inject(MeService);
  private readonly agendaApi = inject(AgendaService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly h = signal<Home | null>(null);
  readonly week = signal<AgendaItem[]>([]);
  readonly today = todayIso();

  readonly firstName = computed(() => this.meService.me()?.firstName ?? '');
  readonly agency = computed(() => this.meService.me()?.agencyName ?? '');
  readonly todayCount = computed(() => this.week().filter(w => w.date === this.today && !w.pending).length);
  readonly accepted = computed(() => (this.h()?.answers ?? []).filter(a => a.status === 'ACCEPTEE' && this.days(a.answeredAt) < 7).length);
  readonly declined = computed(() => (this.h()?.answers ?? []).filter(a => a.status === 'DECLINEE' && this.days(a.answeredAt) < 7).length);
  readonly contractNote = computed(() => {
    const m = this.meService.me(); if (!m || m.role !== 'BOITE_PROD' || !m.contractEnd) return null;
    const left = this.daysTo(m.contractEnd);
    if (m.contractStatus === 'EXPIRE') return { warn: true, text: 'Contrat de l’agence terminé : consultation seule.' };
    return left <= 30 ? { warn: true, text: `Contrat de l’agence : fin dans ${left} jour${left > 1 ? 's' : ''}.` } : null;
  });

  ngOnInit(): void {
    if (!this.meService.me()) this.meService.load().subscribe({ error: () => {} });
    forkJoin({
      home: this.http.get<Home>(`${environment.apiUrl}/agency/home`),
      week: this.agendaApi.list(this.today, addDays(this.today, 7)).pipe(catchError(() => of([] as AgendaItem[])))
    }).subscribe({
      next: r => { this.h.set(r.home); this.week.set(r.week); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger l’accueil. Rechargez la page.'); }
    });
  }

  jump(e: Event, id: string): void { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  greeting(): string { const h = new Date().getHours(); return h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour'; }
  hm(t: string): string { return t.slice(0, 5).replace(':', 'h'); }
  imp(i: string): string { return i === 'PRINCIPAL' ? 'Principal' : i === 'FIGURATION' ? 'Figuration' : 'Secondaire'; }
  total(r: RoleToFill): number { return r.preselected + r.audition + r.callback + r.chosen; }
  barLabel(r: RoleToFill): string {
    const p = [`${r.preselected} présélectionné${r.preselected > 1 ? 's' : ''}`];
    if (r.audition) p.push(`${r.audition} en audition`); if (r.callback) p.push(`${r.callback} en rappel`); if (r.chosen) p.push(`${r.chosen} choisi`);
    return p.join(' · ');
  }
  days(ms: number): number { return Math.floor((Date.now() - ms) / 864e5); }
  daysTo(iso: string): number { const d = fromIso(iso); return d ? Math.ceil((d.getTime() - fromIso(this.today)!.getTime()) / 864e5) : 999; }
  untilLabel(iso: string): string {
    const n = this.daysTo(iso);
    return n < 0 ? 'commencé' : n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : n <= 60 ? `dans ${n} j` : `le ${this.dayLabel(iso)}`;
  }
  dayLabel(iso: string): string {
    if (iso === this.today) return 'Aujourd’hui';
    if (iso === addDays(this.today, 1)) return 'Demain';
    const d = fromIso(iso); if (!d) return iso;
    return `${DAYS_FR[(d.getDay() + 6) % 7].slice(0, 3)}. ${d.getDate()} ${MONTHS_SHORT_FR[d.getMonth()]}`;
  }
  since(ms: number): string { const d = this.days(ms); return d === 0 ? 'aujourd’hui' : d === 1 ? 'depuis hier' : `depuis ${d} j`; }
  ago(ms: number): string {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 60) return m < 1 ? 'à l’instant' : `il y a ${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
    const d = Math.round(h / 24); return d === 1 ? 'hier' : `il y a ${d} j`;
  }
}
