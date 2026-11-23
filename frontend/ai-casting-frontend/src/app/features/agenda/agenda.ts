import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { LiveService } from '../../core/services/live.service';
import { RouterLink } from '@angular/router';
import { AgendaItem, AgendaService } from '../../core/services/agenda.service';
import { MeService } from '../../core/services/me.service';
import { AuthService } from '../../core/services/auth.service';
import { DAYS_FR, MONTHS_FR, MONTHS_SHORT_FR, addDays, fromIso, todayIso } from '../../shared/forms/dates';

interface Day { iso: string; items: AgendaItem[]; }

/** T-116 · Agenda des auditions : par jour, avec l'heure, le lieu et l'état de la convocation. */
@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [RouterLink],
  template: `
  <div class="page">
    <header class="head">
      <div>
        <h1>Agenda</h1>
        <p>{{ isActor() ? 'Vos auditions à venir. La veille, un rappel arrive dans la cloche.' : 'Les auditions de vos projets. La veille, vous et l’acteur recevez un rappel dans la cloche.' }}</p>
      </div>
      <div class="head-act">
        <button type="button" class="sync-btn" [class.on]="syncOpen()" (click)="toggleSync()" [attr.aria-expanded]="syncOpen()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M3 21v-5h5M21 3v5h-5"/></svg>
          Relier à Google ou Outlook
        </button>
        <div class="range" role="radiogroup" aria-label="Période affichée">
          @for (r of ranges; track r.days) {
            <button type="button" role="radio" [attr.aria-checked]="days() === r.days" (click)="setRange(r.days)">{{ r.label }}</button>
          }
        </div>
      </div>
    </header>

    @if (syncOpen()) {
      <section class="sync" aria-labelledby="sync-t">
        <div class="sync-head">
          <h2 id="sync-t">Vos auditions dans votre agenda, automatiquement</h2>
          <p>Abonnez-vous une fois : chaque nouvelle audition, chaque changement d'heure ou de lieu apparaît seul dans Google Agenda ou Outlook (mise à jour toutes les heures environ).</p>
        </div>
        @if (feedUrl(); as url) {
          @if (isLocal()) {
            <p class="warn" role="note">Vous utilisez Cercle à l'adresse « localhost » : Google et Outlook ne peuvent pas la lire. Ouvrez Cercle depuis son adresse en ligne pour vous abonner.</p>
          }
          <div class="providers">
            <a class="prov" [href]="googleSub(url)" target="_blank" rel="noopener">
              <span class="plogo g" aria-hidden="true">G</span><span><b>Google Agenda</b><small>Ajoute l'agenda « Auditions · Cercle »</small></span></a>
            <a class="prov" [href]="outlookSub(url, false)" target="_blank" rel="noopener">
              <span class="plogo o" aria-hidden="true">O</span><span><b>Outlook.com</b><small>Compte personnel Outlook ou Hotmail</small></span></a>
            <a class="prov" [href]="outlookSub(url, true)" target="_blank" rel="noopener">
              <span class="plogo m" aria-hidden="true">365</span><span><b>Outlook · Microsoft 365</b><small>Compte professionnel</small></span></a>
            <a class="prov" [href]="webcal(url)">
              <span class="plogo a" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg></span>
              <span><b>Téléphone, Apple</b><small>iPhone, Mac, Android</small></span></a>
          </div>
          <div class="copyrow">
            <input class="bare" readonly [value]="url" aria-label="Adresse de votre agenda" (focus)="$any($event.target).select()" />
            <button type="button" (click)="copy(url)">{{ copied() ? 'Copié' : 'Copier l’adresse' }}</button>
          </div>
          <p class="fine">Adresse personnelle : ne la partagez pas. Partagée par erreur ? <button type="button" class="lnk" (click)="renew()">Créer une nouvelle adresse</button> (l'ancienne cesse aussitôt de fonctionner).</p>
        } @else { <p class="muted">Préparation de votre adresse d'agenda…</p> }
      </section>
    }

    @if (loading()) {
      <div class="skel"></div><div class="skel short"></div>
    } @else if (error()) {
      <p class="field-msg" role="alert">{{ error() }}</p>
    } @else if (!groups().length) {
      <div class="empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
        <h2>Aucune audition sur cette période</h2>
        @if (isActor()) {
          <p>Quand une agence vous convoque, la demande arrive dans <a routerLink="/mes-propositions">Propositions</a> ; une fois acceptée, elle s’affiche ici.</p>
        } @else {
          <p>Convoquez un candidat depuis la shortlist d’un rôle : l’audition s’affiche ici dès l’envoi, puis se confirme quand l’acteur accepte.</p>
          <a class="btn-ghost" routerLink="/projects">Ouvrir mes projets</a>
        }
      </div>
    } @else {
      <p class="sum">{{ total() }} audition{{ total() > 1 ? 's' : '' }} · {{ confirmed() }} confirmée{{ confirmed() > 1 ? 's' : '' }}@if (waiting()) { · {{ waiting() }} en attente de réponse }</p>
      <ol class="days">
        @for (d of groups(); track d.iso) {
          <li class="day" [class.today]="d.iso === today">
            <div class="date" aria-hidden="true"><b>{{ dayNum(d.iso) }}</b><span>{{ monthShort(d.iso) }}</span></div>
            <div class="col">
              <h2>{{ dayLabel(d.iso) }}</h2>
              <ul>
                @for (it of d.items; track it.entryId + it.pending) {
                  <li class="item" [class.pending]="it.pending">
                    @if (it.time) { <span class="time">{{ hm(it.time) }}</span> } @else { <span class="time none">Heure<br>à préciser</span> }
                    <div class="what">
                      @if (isActor()) {
                        <b>{{ it.roleName }}</b>
                        <span class="muted">{{ it.projectTitle }} · {{ it.agencyName }}</span>
                      } @else {
                        <a [routerLink]="['/roles', it.roleId]"><b>{{ it.actorName }}</b></a>
                        <span class="muted">{{ it.roleName }} · {{ it.projectTitle }}</span>
                      }
                      @if (it.place) {
                        <a class="place" [href]="mapUrl(it.place)" target="_blank" rel="noopener">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
                          {{ it.place }}</a>
                      } @else { <span class="muted small">Lieu à préciser</span> }
                    </div>
                    <div class="side">
                      <span class="pill" [attr.data-s]="it.status">{{ statusLabel(it) }}</span>
                      @if (!it.pending) {
                        <div class="addcal">
                          <button type="button" class="ics" (click)="menu.set(menu() === it.entryId ? null : it.entryId)" [attr.aria-expanded]="menu() === it.entryId"
                                  [attr.aria-label]="'Ajouter à mon agenda : ' + (isActor() ? it.roleName : it.actorName)">+ Agenda</button>
                          @if (menu() === it.entryId) {
                            <div class="calmenu" role="menu">
                              <a role="menuitem" [href]="googleEvent(it)" target="_blank" rel="noopener" (click)="menu.set(null)"><span class="plogo g sm">G</span>Google Agenda</a>
                              <a role="menuitem" [href]="outlookEvent(it, false)" target="_blank" rel="noopener" (click)="menu.set(null)"><span class="plogo o sm">O</span>Outlook.com</a>
                              <a role="menuitem" [href]="outlookEvent(it, true)" target="_blank" rel="noopener" (click)="menu.set(null)"><span class="plogo m sm">365</span>Microsoft 365</a>
                              <button type="button" role="menuitem" (click)="ics(it); menu.set(null)"><span class="plogo a sm">.ics</span>Fichier (Apple, autre)</button>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  </li>
                }
              </ul>
            </div>
          </li>
        }
      </ol>
    }
  </div>
  `,
  styles: [`
  :host { display: block; }
  .page { max-width: 920px; padding: 28px 32px 48px; display: flex; flex-direction: column; gap: 18px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 38px; line-height: 1.05; }
  .head p { margin-top: 8px; color: var(--text-muted); line-height: 1.55; max-width: 60ch; }
  .range { display: inline-flex; padding: 3px; border-radius: 999px; border: 1px solid var(--border); background: var(--glass); }
  .range button { height: 32px; padding: 0 14px; border: none; border-radius: 999px; background: none; color: var(--text-muted); font-size: 13px; font-weight: 600; cursor: pointer;
    &[aria-checked="true"] { background: var(--accent); color: var(--on-accent); } &:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; } }
  .sum { color: var(--text-muted); font-size: 14px; }
  .days { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
  .day { display: grid; grid-template-columns: 64px 1fr; gap: 16px; }
  .date { position: sticky; top: 12px; align-self: start; height: 64px; border-radius: var(--radius-m); border: 1px solid var(--border); background: var(--glass);
    display: grid; place-content: center; text-align: center; b { font-size: 26px; line-height: 1; } span { font-size: 12px; color: var(--text-muted); } }
  .day.today .date { background: var(--accent); border-color: var(--accent); color: var(--on-accent); span { color: inherit; opacity: .85; } }
  .col h2 { font-size: 15px; font-stretch: 100%; font-weight: 600; margin: 4px 0 8px; text-transform: none; color: var(--text-muted); }
  .day.today .col h2 { color: var(--text-primary); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .item { display: grid; grid-template-columns: 92px 1fr auto; gap: 14px; align-items: start; padding: 14px 16px; border-radius: var(--radius-m);
    border: 1px solid var(--border); border-left: 4px solid var(--accent); background: var(--glass); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }
  .item.pending { border-left-style: dashed; border-left-color: var(--text-subtle); }
  .time { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .item.pending .time { color: var(--text-muted); }
  .time.none { font-size: 12.5px; font-weight: 600; line-height: 1.3; color: var(--text-muted); padding-top: 3px; }
  .what { display: flex; flex-direction: column; gap: 3px; min-width: 0; a { color: inherit; text-decoration: none; } a:hover b { text-decoration: underline; } b { font-size: 16px; } }
  .place { display: inline-flex; gap: 6px; align-items: center; font-size: 13.5px; color: var(--accent-ink) !important; margin-top: 2px; }
  .muted { color: var(--text-muted); font-size: 13.5px; } .small { font-size: 12.5px; }
  .side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  .pill { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; white-space: nowrap; background: var(--accent-dim); color: var(--text-primary); }
  .pill[data-s="EN_ATTENTE"] { background: var(--bg-hover); color: var(--text-muted); }
  .ics { border: 1px solid var(--border); background: none; color: var(--text-muted); font-size: 12.5px; height: 28px; padding: 0 10px; border-radius: 999px; cursor: pointer;
    &:hover { color: var(--text-primary); border-color: var(--accent); } }
  .head-act { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .sync-btn { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border);
    background: var(--glass); color: var(--text-primary); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: border-color .15s, background .15s; }
  .sync-btn:hover, .sync-btn.on { border-color: var(--accent); }
  .sync-btn.on { background: var(--accent-dim); }
  .sync { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 18px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
    background: var(--glass); animation: syncIn .3s cubic-bezier(.2,.8,.2,1) both; }
  .sync h2 { font-size: 18px; margin: 0; }
  .sync-head p { margin: 6px 0 0; color: var(--text-muted); font-size: 14px; line-height: 1.5; max-width: 70ch; }
  .providers { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr)); gap: 8px; }
  .prov { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg-surface);
    color: var(--text-primary); text-decoration: none; transition: border-color .15s, transform .15s; }
  .prov:hover { border-color: var(--accent); transform: translateY(-1px); }
  .prov span:last-child { display: flex; flex-direction: column; min-width: 0; } .prov b { font-size: 14px; } .prov small { font-size: 12px; color: var(--text-muted); }
  .plogo { flex: none; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-weight: 800; font-size: 15px; color: #fff; }
  .plogo.g { background: #fff; color: #4285F4; box-shadow: inset 0 0 0 1px var(--border); }
  .plogo.o { background: #0F6CBD; } .plogo.m { background: #2B579A; font-size: 11px; } .plogo.a { background: var(--bg-hover); color: var(--text-primary); font-size: 10px; }
  .plogo.sm { width: 24px; height: 24px; border-radius: 7px; font-size: 11px; }
  .plogo.m.sm { font-size: 8.5px; } .plogo.a.sm { font-size: 8.5px; }
  .copyrow { display: flex; gap: 6px; min-width: 0; }
  .copyrow input { flex: 1; width: 0; min-width: 0; height: 38px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-primary);
    color: var(--text-muted); font: inherit; font-size: 12.5px; text-overflow: ellipsis; }
  .copyrow button { flex: none; height: 38px; padding: 0 14px; border-radius: 10px; border: 0; background: var(--accent); color: var(--on-accent); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
  .fine { margin: 0; font-size: 12.5px; color: var(--text-subtle); line-height: 1.5; }
  .lnk { border: 0; background: none; padding: 0; color: var(--accent-ink); font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline; }
  .warn { margin: 0; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--danger) 10%, transparent); color: var(--text-primary); font-size: 13px; }
  .addcal { position: relative; }
  .calmenu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 210px; display: flex; flex-direction: column; padding: 6px;
    border-radius: 12px; border: 1px solid var(--border); background: var(--bg-surface); box-shadow: 0 16px 40px rgba(0,0,0,.35); animation: syncIn .18s ease both; }
  .calmenu a, .calmenu button { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; border: 0; background: transparent;
    color: var(--text-primary) !important; text-decoration: none; font: inherit; font-size: 13.5px; text-align: left; cursor: pointer; }
  .calmenu a:hover, .calmenu button:hover { background: var(--accent-dim); }
  @keyframes syncIn { from { opacity: 0; transform: translateY(-4px); } }
  .empty { padding: 40px 20px; text-align: center; border-radius: var(--radius-m); border: 1px dashed var(--border); display: grid; justify-items: center; gap: 10px; color: var(--text-muted);
    h2 { font-size: 20px; color: var(--text-primary); } p { max-width: 52ch; line-height: 1.55; } a { color: var(--accent-ink); } }
  .btn-ghost { display: inline-flex; align-items: center; height: 40px; padding: 0 16px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--glass); color: var(--text-primary) !important; font-weight: 600; text-decoration: none; }
  .skel { height: 120px; border-radius: var(--radius-l); background: var(--bg-hover); } .skel.short { height: 80px; }
  @container page (max-width: 760px) {
    .page { padding: 20px 16px 32px; } h1 { font-size: 30px; }
    .day { grid-template-columns: 1fr; gap: 6px; } .date { display: none; } .col h2 { margin-top: 6px; color: var(--text-primary); }
    .item { grid-template-columns: 1fr; gap: 6px; } .side { flex-direction: row; align-items: center; justify-content: space-between; }
  }
  `]
})
export class AgendaComponent implements OnInit {
  private readonly api = inject(AgendaService);
  private readonly me = inject(MeService);
  private readonly auth = inject(AuthService);
  readonly isActor = computed(() => (this.me.me()?.role ?? this.auth.role()) === 'ACTEUR');
  readonly today = todayIso();
  readonly ranges = [{ days: 7, label: '7 jours' }, { days: 30, label: '30 jours' }, { days: 90, label: '3 mois' }];
  readonly days = signal(30);
  readonly items = signal<AgendaItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly groups = computed<Day[]>(() => {
    const m = new Map<string, AgendaItem[]>();
    for (const it of this.items()) { if (!m.has(it.date)) m.set(it.date, []); m.get(it.date)!.push(it); }
    return [...m.entries()].map(([iso, items]) => ({ iso, items }));
  });
  readonly total = computed(() => this.items().length);
  readonly waiting = computed(() => this.items().filter(i => i.pending).length);
  readonly confirmed = computed(() => this.total() - this.waiting());

  private readonly live = inject(LiveService);
  private readonly destroyRef = inject(DestroyRef);
  ngOnInit(): void { this.load(); this.live.watch(this.destroyRef, () => this.load(true)); }

  // ── Agenda relié à Google ou Outlook ──
  readonly syncOpen = signal(false);
  readonly feedUrl = signal<string | null>(null);
  readonly copied = signal(false);
  readonly menu = signal<string | null>(null);
  readonly isLocal = () => /^(localhost|127\.|\[::1\])/.test(location.hostname);
  toggleSync(): void {
    this.syncOpen.update(v => !v);
    if (this.syncOpen() && !this.feedUrl()) this.api.feed().subscribe({ next: f => this.feedUrl.set(this.url(f.token)), error: () => this.error.set('Adresse d’agenda indisponible pour le moment.') });
  }
  renew(): void { this.api.renewFeed().subscribe({ next: f => this.feedUrl.set(this.url(f.token)) }); }
  private url(token: string): string { return `${location.origin}/api/public/agenda/${token}.ics`; }
  webcal(url: string): string { return url.replace(/^https?:/, 'webcal:'); }
  googleSub(url: string): string { return 'https://calendar.google.com/calendar/u/0/r?cid=' + encodeURIComponent(this.webcal(url)); }
  outlookSub(url: string, pro: boolean): string {
    return `https://outlook.${pro ? 'office' : 'live'}.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent('Auditions · Cercle')}`;
  }
  copy(url: string): void {
    const done = () => { this.copied.set(true); setTimeout(() => this.copied.set(false), 1800); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, () => {}); else done();
  }

  /** Une audition à la fois : ouvre Google Agenda ou Outlook avec l'audition déjà remplie. */
  private when(it: AgendaItem): { s: string; e: string; allDay: boolean } {
    if (!it.time) return { s: it.date, e: addDays(it.date, 1), allDay: true };
    const [h, m] = it.time.split(':').map(Number);
    const pad = (n: number) => String(n).padStart(2, '0');
    return { s: `${it.date}T${pad(h)}:${pad(m)}:00`, e: `${it.date}T${pad(Math.min(23, h + 1))}:${pad(m)}:00`, allDay: false };
  }
  private title(it: AgendaItem): string { return this.isActor() ? `Audition · ${it.roleName}` : `Audition · ${it.actorName} (${it.roleName})`; }
  googleEvent(it: AgendaItem): string {
    const w = this.when(it), z = (s: string) => s.replace(/[-:]/g, '');
    const q = new URLSearchParams({ action: 'TEMPLATE', text: this.title(it), dates: `${z(w.s)}/${z(w.e)}`, ctz: 'Africa/Tunis',
      details: `${it.projectTitle} · ${it.agencyName}`, location: it.place ?? '' });
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }
  outlookEvent(it: AgendaItem, pro: boolean): string {
    const w = this.when(it);
    const q = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: this.title(it), startdt: w.s, enddt: w.e,
      location: it.place ?? '', body: `${it.projectTitle} · ${it.agencyName}` });
    if (w.allDay) q.set('allday', 'true');
    return `https://outlook.${pro ? 'office' : 'live'}.com/calendar/0/deeplink/compose?` + q.toString();
  }

  setRange(d: number): void { if (d !== this.days()) { this.days.set(d); this.load(); } }

  private load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.api.list(this.today, addDays(this.today, this.days())).subscribe({
      next: l => { this.items.set(l); this.loading.set(false); this.error.set(''); },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger l’agenda. Rechargez la page.'); }
    });
  }

  dayNum(iso: string): number { return fromIso(iso)!.getDate(); }
  monthShort(iso: string): string { return MONTHS_SHORT_FR[fromIso(iso)!.getMonth()]; }
  dayLabel(iso: string): string {
    const d = fromIso(iso)!;
    const label = `${DAYS_FR[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
    if (iso === this.today) return 'Aujourd’hui · ' + label;
    if (iso === addDays(this.today, 1)) return 'Demain · ' + label;
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  hm(t: string): string { return t.slice(0, 5).replace(':', 'h'); }
  statusLabel(it: AgendaItem): string { return it.pending ? 'En attente de réponse' : it.status === 'RAPPEL' ? 'Rappel (2ᵉ tour)' : 'Confirmée'; }
  mapUrl(place: string): string { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place); }

  /** Fichier .ics pour l'ajouter à Google Agenda, Outlook ou au téléphone (1 h par défaut). */
  ics(it: AgendaItem): void {
    const day = it.date.replace(/-/g, '');
    const [h, mi] = (it.time ?? '09:00').split(':');
    const start = `${day}T${h}${mi}00`;
    const endH = String(Math.min(23, +h + 1)).padStart(2, '0');
    const title = this.isActor() ? `Audition · ${it.roleName}` : `Audition · ${it.actorName} (${it.roleName})`;
    const esc = (s: string) => s.replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, ' ');
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cercle//Agenda//FR', 'BEGIN:VEVENT',
      `UID:${it.entryId}@ai-casting`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART:${start}`, `DTEND:${day}T${endH}${mi}00`, `SUMMARY:${esc(title)}`,
      `LOCATION:${esc(it.place ?? '')}`, `DESCRIPTION:${esc(it.projectTitle + ' · ' + it.agencyName)}`,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Audition demain', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
    a.download = `audition-${it.date}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
