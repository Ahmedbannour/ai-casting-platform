import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
      <div class="range" role="radiogroup" aria-label="Période affichée">
        @for (r of ranges; track r.days) {
          <button type="button" role="radio" [attr.aria-checked]="days() === r.days" (click)="setRange(r.days)">{{ r.label }}</button>
        }
      </div>
    </header>

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
                        <button type="button" class="ics" (click)="ics(it)" [attr.aria-label]="'Ajouter à mon calendrier : ' + (isActor() ? it.roleName : it.actorName)">+ Calendrier</button>
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
  .place { display: inline-flex; gap: 6px; align-items: center; font-size: 13.5px; color: var(--accent) !important; margin-top: 2px; }
  .muted { color: var(--text-muted); font-size: 13.5px; } .small { font-size: 12.5px; }
  .side { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
  .pill { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; white-space: nowrap; background: var(--accent-dim); color: var(--text-primary); }
  .pill[data-s="EN_ATTENTE"] { background: var(--bg-hover); color: var(--text-muted); }
  .ics { border: 1px solid var(--border); background: none; color: var(--text-muted); font-size: 12.5px; height: 28px; padding: 0 10px; border-radius: 999px; cursor: pointer;
    &:hover { color: var(--text-primary); border-color: var(--accent); } }
  .empty { padding: 40px 20px; text-align: center; border-radius: var(--radius-m); border: 1px dashed var(--border); display: grid; justify-items: center; gap: 10px; color: var(--text-muted);
    h2 { font-size: 20px; color: var(--text-primary); } p { max-width: 52ch; line-height: 1.55; } a { color: var(--accent); } }
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

  ngOnInit(): void { this.load(); }

  setRange(d: number): void { if (d !== this.days()) { this.days.set(d); this.load(); } }

  private load(): void {
    this.loading.set(true);
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
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AI Casting//Agenda//FR', 'BEGIN:VEVENT',
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
