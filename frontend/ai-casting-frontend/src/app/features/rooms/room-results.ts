import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ResultRow, RoomRole, RoomService, SIDE_LABEL } from '../../core/services/room.service';

/** Tableau des résultats d'un rôle : classement (choix, coups de cœur, matchs, oui), votes de chacun, choix du chef de room. */
@Component({
  selector: 'app-room-results',
  standalone: true,
  template: `
  <div class="roles" role="tablist" aria-label="Rôle">
    @for (r of roles(); track r.id) {
      <button type="button" role="tab" [class.on]="r.id === roleId()" [attr.aria-selected]="r.id === roleId()" (click)="pick(r.id)">
        {{ r.name }} @if (r.matches) { <span class="n m">{{ r.matches }} match{{ r.matches > 1 ? 's' : '' }}</span> }
      </button>
    }
  </div>

  @if (rows().length) {
    <p class="sum"><b>{{ rows().length }}</b> candidat{{ rows().length > 1 ? 's' : '' }} · <b>{{ matches() }}</b> match{{ matches() > 1 ? 's' : '' }}
      · classés par choix, coups de cœur, matchs puis nombre de oui.</p>
  }

  @if (loading()) {
    @for (i of [1, 2, 3]; track i) { <div class="row skel"></div> }
  } @else if (!rows().length) {
    <div class="empty"><h3>Aucun candidat pour ce rôle</h3><p>Les candidats de la shortlist apparaîtront ici avec les votes de l'équipe.</p></div>
  } @else {
    <ol class="list">
      @for (r of rows(); track r.entryId; let i = $index) {
        <li class="row" [class.match]="r.match" [class.ranked]="r.rank" [style.--d]="i">
          <span class="pos">{{ i + 1 }}</span>
          <span class="av" [style.background-image]="r.photoUrl ? 'url(' + r.photoUrl + ')' : null">@if (!r.photoUrl) { {{ initials(r.name) }} }</span>
          <div class="who">
            <b>{{ r.name }}</b>
            <small>{{ meta(r.age, r.city) }}</small>
            <div class="badges">
              @if (r.rank) { <span class="b rank">{{ rankLabel(r.rank) }}</span> }
              @if (r.match) { <span class="b match"><i aria-hidden="true"></i>Match</span> }
              @if (r.coeurs) { <span class="b heart">★ {{ r.coeurs }}</span> }
              <span class="b score">{{ r.oui + r.coeurs }} oui · {{ r.non }} non</span>
            </div>
          </div>
          <div class="votes" [attr.aria-label]="r.voters + ' vote' + (r.voters > 1 ? 's' : '')">
            @for (v of r.votes; track $index) {
              <span class="v" [class]="'v ' + v.vote.toLowerCase()" [title]="v.name + ' (' + side(v.role) + ') : ' + voteLabel(v.vote)">
                {{ initials(v.name) }}<em>{{ v.vote === 'NON' ? '✕' : v.vote === 'COEUR' ? '★' : '✓' }}</em></span>
            }
            @if (!r.votes.length) { <small class="none">Pas encore de vote</small> }
          </div>
          @if (lead()) {
            <div class="rank" role="group" [attr.aria-label]="'Choix pour ' + r.name">
              @for (k of [1, 2, 3]; track k) {
                <button type="button" [class.on]="r.rank === k" [attr.aria-pressed]="r.rank === k" (click)="setRank(r, k)">{{ rankShort(k) }}</button>
              }
            </div>
          }
        </li>
      }
    </ol>
  }
  @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
  `,
  styles: [`
  :host { display: flex; flex-direction: column; gap: 12px; }
  .roles { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
  .roles button { flex: none; height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--glass);
    color: var(--text-muted); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
  .roles button.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .roles .n { font-size: 11.5px; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, currentColor 16%, transparent); }
  .sum { margin: 0; font-size: 13px; color: var(--text-muted); } .sum b { color: var(--text-primary); }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .row { display: grid; grid-template-columns: 26px 52px minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px;
    border: 1px solid var(--border); background: var(--glass); animation: rowIn .35s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--d) * 40ms); }
  @keyframes rowIn { from { opacity: 0; transform: translateY(8px); } }
  .row.match { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); box-shadow: 0 0 0 1px var(--accent-dim) inset; }
  .row.ranked { background: linear-gradient(90deg, var(--accent-dim), var(--glass) 60%); }
  .row.skel { height: 76px; animation: none; background: linear-gradient(90deg, var(--glass), var(--bg-secondary), var(--glass)); background-size: 200% 100%; }
  .pos { font-weight: 800; font-size: 15px; color: var(--text-subtle); text-align: center; font-variant-numeric: tabular-nums; }
  .av { width: 52px; height: 52px; border-radius: 14px; background: var(--graphite-600) center 25% / cover; display: grid; place-items: center;
    color: var(--paper); font-weight: 800; font-size: 16px; }
  .who { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .who b { font-size: 15.5px; } .who small { font-size: 12.5px; color: var(--text-muted); }
  .badges { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
  .b { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--text-subtle) 14%, transparent); color: var(--text-secondary); display: inline-flex; align-items: center; gap: 5px; }
  .b.match { background: var(--accent); color: var(--on-accent); }
  .b.match i { width: 7px; height: 7px; border-radius: 50%; background: var(--on-accent); animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { transform: scale(.5); opacity: .5; } }
  .b.heart { background: var(--accent-dim); color: var(--accent-ink); }
  .b.rank { background: var(--graphite-900); color: var(--crayon-300); }
  :host-context(.light) .b.rank { background: var(--graphite-900); }
  .votes { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; max-width: 180px; }
  .v { position: relative; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 800;
    background: var(--bg-secondary); border: 2px solid var(--border); color: var(--text-secondary); }
  .v em { position: absolute; right: -4px; bottom: -4px; width: 15px; height: 15px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 9px; color: #fff; }
  .v.oui { border-color: var(--success); } .v.oui em { background: var(--success); }
  .v.non { border-color: var(--danger); } .v.non em { background: var(--danger); }
  .v.coeur { border-color: var(--accent); } .v.coeur em { background: var(--accent); color: var(--on-accent); }
  .none { font-size: 12px; color: var(--text-subtle); }
  .rank { display: flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .rank button { height: 32px; padding: 0 9px; border: 0; background: transparent; color: var(--text-muted); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
  .rank button + button { border-left: 1px solid var(--border); }
  .rank button.on { background: var(--accent); color: var(--on-accent); }
  .empty { padding: 30px 20px; text-align: center; border: 1px dashed var(--border); border-radius: 16px; }
  .empty h3 { margin: 0 0 6px; } .empty p { margin: 0; color: var(--text-muted); font-size: 14px; }
  .err { color: var(--danger); font-size: 13.5px; margin: 0; }
  @media (max-width: 640px) {
    .row { grid-template-columns: 22px 46px minmax(0, 1fr); }
    .av { width: 46px; height: 46px; }
    .votes { grid-column: 2 / -1; justify-content: flex-start; max-width: none; }
    .rank { grid-column: 2 / -1; justify-self: start; }
  }
  `]
})
export class RoomResultsComponent {
  private readonly api = inject(RoomService);
  readonly roomId = input.required<string>();
  readonly roles = input<RoomRole[]>([]);
  readonly lead = input(false);
  readonly startRole = input<string | null>(null);

  readonly roleId = signal<string | null>(null);
  readonly rows = signal<ResultRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly matches = computed(() => this.rows().filter(r => r.match).length);

  constructor() {
    effect(() => {
      const rs = this.roles(); const want = this.startRole();
      if (!rs.length) return;
      const cur = untracked(this.roleId);
      const target = want && want !== cur ? want : cur ?? rs[0].id;
      if (target !== cur) untracked(() => this.pick(target));
    });
  }

  pick(id: string): void {
    this.roleId.set(id); this.loading.set(true); this.error.set('');
    this.api.results(this.roomId(), id).subscribe({
      next: r => { this.rows.set(r); this.loading.set(false); },
      error: e => { this.loading.set(false); this.rows.set([]); this.error.set(e.error?.message ?? 'Résultats indisponibles.'); }
    });
  }

  setRank(r: ResultRow, k: number): void {
    this.api.rank(this.roomId(), r.entryId, r.rank === k ? null : k).subscribe({
      next: rows => this.rows.set(rows),
      error: e => this.error.set(e.error?.message ?? 'Choix impossible.')
    });
  }

  meta(age: number | null, city: string | null): string { return [age ? age + ' ans' : '', city].filter(Boolean).join(' · '); }
  rankLabel(k: number): string { return k === 1 ? '1er choix' : k === 2 ? 'Remplaçant' : 'Suppléant'; }
  rankShort(k: number): string { return k === 1 ? '1er choix' : k === 2 ? 'Rempl.' : 'Suppl.'; }
  voteLabel(v: string): string { return v === 'NON' ? 'non' : v === 'COEUR' ? 'coup de cœur' : 'oui'; }
  side(r: string): string { return SIDE_LABEL[r] ?? r; }
  initials(n: string): string { return n.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
}
