import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MeService, Visibility } from '../../core/services/me.service';
import { MyOffer, OFFER_KIND, OfferService } from '../../core/services/offer.service';
import { AgendaItem, AgendaService } from '../../core/services/agenda.service';
import { ProfileScoreComponent } from '../actors/actor-form/profile-score';
import { DAYS_FR, MONTHS_SHORT_FR, addDays, fromIso, todayIso } from '../../shared/forms/dates';

interface Notif { id: string; kind: string; title: string; body: string | null; link: string | null; createdAt: number; read: boolean; }
interface FeedEvent { at: number; icon: string; title: string; body: string; link: string | null; }

/**
 * T-141 · Accueil de l'espace acteur : ce qui attend une réponse, la prochaine audition,
 * la visibilité du profil, qui s'y intéresse et ce qu'il reste à compléter.
 */
@Component({
  selector: 'app-actor-home',
  standalone: true,
  imports: [RouterLink, ProfileScoreComponent],
  template: `
  <div class="page">
    <header class="head">
      <div>
        <p class="hello">{{ greeting() }}</p>
        <h1>{{ firstName() || 'Mon espace' }}</h1>
      </div>
      @if (vis(); as v) {
        <a class="vis" [class.pause]="v.visibility === 'PAUSE'" routerLink="/mon-profil" [attr.aria-label]="v.visibility === 'PAUSE' ? 'Profil en pause : modifier' : 'Profil visible des agences : modifier'">
          <span class="dot" aria-hidden="true"></span>
          {{ v.visibility === 'PAUSE' ? 'Profil en pause : invisible des agences' : 'Visible des agences' }}
        </a>
      }
    </header>

    @if (loading()) {
      <div class="tiles"><div class="tile skel"></div><div class="tile skel"></div><div class="tile skel"></div></div>
    } @else {
      <section class="tiles" aria-label="En un coup d’œil">
        <a class="tile" [class.hot]="pending().length" routerLink="/mes-propositions">
          <span class="k">À traiter</span>
          <b class="n">{{ pending().length }}</b>
          <span class="s">{{ pending().length ? (pending().length > 1 ? 'demandes attendent votre réponse' : 'demande attend votre réponse') : 'Aucune demande en attente' }}</span>
        </a>
        <a class="tile" routerLink="/agenda">
          <span class="k">Prochaine audition</span>
          @if (next(); as n) {
            <b class="n sm">{{ dayLabel(n.date) }}@if (n.time) { <span> · {{ hm(n.time) }}</span> }</b>
            <span class="s">{{ n.pending ? 'À confirmer · ' : '' }}{{ n.roleName }} · {{ n.agencyName }}</span>
          } @else {
            <b class="n">—</b><span class="s">Aucune audition prévue</span>
          }
        </a>
        <div class="tile">
          <span class="k">Intérêt des agences</span>
          <b class="n">{{ views30() }}</b>
          <span class="s">{{ views30() > 1 ? 'consultations' : 'consultation' }} de vos coordonnées en 30 jours</span>
        </div>
      </section>

      @if (pending().length) {
        <section class="block" aria-labelledby="h-todo">
          <div class="bh"><h2 id="h-todo">Vous avez une réponse à donner</h2><a routerLink="/mes-propositions">Tout voir</a></div>
          <ul class="offers">
            @for (o of pending().slice(0, 3); track o.id) {
              <li>
                <span class="badge" [class.aud]="o.kind === 'AUDITION'">{{ o.kind === 'AUDITION' ? 'Audition' : 'Rôle' }}</span>
                <div class="o-main"><b>{{ o.roleName }}</b><span>{{ o.projectTitle }} · {{ o.agencyName }}@if (o.auditionDate) { · {{ dayLabel(o.auditionDate) }} }</span></div>
                <a class="btn" routerLink="/mes-propositions">Répondre</a>
              </li>
            }
          </ul>
        </section>
      }

      <app-profile-score />

      <section class="block" aria-labelledby="h-act">
        <div class="bh"><h2 id="h-act">Activité récente</h2></div>
        @if (events().length) {
          <ol class="feed">
            @for (e of events(); track $index) {
              <li>
                <span class="ic" aria-hidden="true">{{ e.icon }}</span>
                <div><b>{{ e.title }}</b>@if (e.body) { <span>{{ e.body }}</span> }</div>
                <time>{{ ago(e.at) }}</time>
              </li>
            }
          </ol>
        } @else {
          <p class="empty">Rien pour l’instant. Un profil complet, avec une photo principale et des disponibilités à jour, ressort mieux dans les recherches des agences.</p>
        }
      </section>
    }
  </div>
  `,
  styles: [`
  :host { display: block; }
  .page { max-width: 980px; padding: 28px 32px 48px; display: flex; flex-direction: column; gap: 18px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
  .hello { color: var(--text-muted); font-size: 14px; }
  h1 { font-size: 40px; line-height: 1.05; margin-top: 2px; }
  .vis { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border);
    background: var(--glass); color: var(--text-primary); font-size: 13px; font-weight: 600; text-decoration: none;
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--series-3, #3fb950); box-shadow: 0 0 0 4px color-mix(in srgb, var(--series-3, #3fb950) 22%, transparent); }
    &.pause .dot { background: var(--text-subtle); box-shadow: none; } &:hover { border-color: var(--accent); } }
  .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .tile { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; border-radius: var(--radius-l); border: 1px solid var(--border);
    background: var(--glass); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); color: inherit; text-decoration: none; min-height: 128px;
    transition: border-color .15s, transform .15s; }
  a.tile:hover { border-color: var(--accent); transform: translateY(-2px); }
  a.tile:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .tile.hot { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--glass)); }
  .k { font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
  .n { font-size: 40px; line-height: 1; font-weight: 800; font-variant-numeric: tabular-nums; }
  .n.sm { font-size: 22px; line-height: 1.2; span { color: var(--accent); } }
  .s { font-size: 13px; color: var(--text-muted); line-height: 1.4; }
  .skel { background: var(--bg-hover); border: none; }
  .block { padding: 16px 18px; border-radius: var(--radius-l); border: 1px solid var(--border); background: var(--glass);
    -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }
  .bh { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 10px;
    h2 { font-size: 18px; font-stretch: 100%; } a { font-size: 13px; color: var(--accent); } }
  .offers { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px;
    li { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 10px 12px; border-radius: var(--radius-m); background: var(--bg-surface); border: 1px solid var(--border); } }
  .badge { font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: var(--bg-hover); color: var(--text-muted);
    &.aud { background: var(--accent); color: var(--on-accent); } }
  .o-main { display: flex; flex-direction: column; min-width: 0; b { font-size: 15px; } span { font-size: 13px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
  .btn { height: 34px; padding: 0 14px; display: inline-flex; align-items: center; border-radius: var(--radius-s); background: var(--accent); color: var(--on-accent);
    font-size: 13px; font-weight: 700; text-decoration: none; &:hover { background: var(--accent-hover); } }
  .feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column;
    li { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: start; padding: 10px 0; border-top: 1px solid var(--border); }
    li:first-child { border-top: none; }
    .ic { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--bg-hover); font-size: 14px; }
    div { display: flex; flex-direction: column; min-width: 0; b { font-size: 14px; font-weight: 600; } span { font-size: 13px; color: var(--text-muted); } }
    time { font-size: 12px; color: var(--text-subtle); white-space: nowrap; padding-top: 2px; } }
  .empty { color: var(--text-muted); font-size: 14px; line-height: 1.55; }
  app-profile-score { margin-top: 0; }
  @container page (max-width: 760px) {
    .page { padding: 20px 16px 32px; } h1 { font-size: 32px; }
    .tiles { grid-template-columns: 1fr; } .tile { min-height: 0; }
    .offers li { grid-template-columns: 1fr auto; } .badge { grid-column: 1 / -1; justify-self: start; }
  }
  @media (prefers-reduced-motion: reduce) { .tile { transition: none; } a.tile:hover { transform: none; } }
  `]
})
export class ActorHomeComponent implements OnInit {
  private readonly meService = inject(MeService);
  private readonly offersApi = inject(OfferService);
  private readonly agendaApi = inject(AgendaService);
  private readonly http = inject(HttpClient);

  readonly kind = OFFER_KIND;
  readonly loading = signal(true);
  readonly offers = signal<MyOffer[]>([]);
  readonly agenda = signal<AgendaItem[]>([]);
  readonly views = signal<{ who: string; viewedAt: number }[]>([]);
  readonly notifs = signal<Notif[]>([]);
  readonly vis = signal<Visibility | null>(null);

  readonly firstName = computed(() => this.meService.me()?.firstName ?? '');
  readonly pending = computed(() => this.offers().filter(o => o.status === 'ENVOYEE'));
  /** Prochaine audition : confirmée en priorité, sinon la convocation qui attend une réponse. */
  readonly next = computed(() => this.agenda().find(a => !a.pending) ?? this.agenda().find(a => a.pending) ?? null);
  readonly views30 = computed(() => { const t = Date.now() - 30 * 864e5; return this.views().filter(v => v.viewedAt >= t).length; });
  readonly events = computed<FeedEvent[]>(() => {
    const list: FeedEvent[] = this.notifs().map(n => ({ at: n.createdAt, icon: n.kind === 'AUDITION' ? '🎬' : n.kind === 'PROPOSITION' ? '✉️' : n.kind === 'CONTACT' ? '👁' : '•', title: n.title, body: n.body ?? '', link: n.link }));
    const notifTitles = new Set(list.map(e => e.title));
    for (const v of this.views()) {
      const title = `${v.who} a consulté vos coordonnées`;
      if (!notifTitles.has(title)) list.push({ at: v.viewedAt, icon: '👁', title, body: '', link: null });
    }
    return list.sort((a, b) => b.at - a.at).slice(0, 8);
  });

  ngOnInit(): void {
    const today = todayIso();
    forkJoin({
      offers: this.offersApi.mine().pipe(catchError(() => of([] as MyOffer[]))),
      agenda: this.agendaApi.list(today, addDays(today, 120)).pipe(catchError(() => of([] as AgendaItem[]))),
      views: this.meService.contactViews().pipe(catchError(() => of([]))),
      notifs: this.http.get<{ unread: number; items: Notif[] }>(`${environment.apiUrl}/me/notifications`).pipe(catchError(() => of({ unread: 0, items: [] as Notif[] }))),
      vis: this.meService.visibility().pipe(catchError(() => of(null)))
    }).subscribe(r => {
      this.offers.set(r.offers); this.agenda.set(r.agenda); this.views.set(r.views); this.notifs.set(r.notifs.items); this.vis.set(r.vis);
      this.loading.set(false);
    });
  }

  greeting(): string { const h = new Date().getHours(); return h < 5 ? 'Bonsoir' : h < 18 ? 'Bonjour' : 'Bonsoir'; }
  hm(t: string): string { return t.slice(0, 5).replace(':', 'h'); }
  dayLabel(iso: string): string {
    const d = fromIso(iso); if (!d) return iso;
    const today = todayIso();
    if (iso === today) return 'Aujourd’hui';
    if (iso === addDays(today, 1)) return 'Demain';
    return `${DAYS_FR[(d.getDay() + 6) % 7].slice(0, 3)}. ${d.getDate()} ${MONTHS_SHORT_FR[d.getMonth()]}`;
  }
  ago(ms: number): string {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'à l’instant'; if (m < 60) return `il y a ${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
    const d = Math.round(h / 24); return d === 1 ? 'hier' : d < 30 ? `il y a ${d} j` : new Date(ms).toLocaleDateString('fr-FR');
  }
}
