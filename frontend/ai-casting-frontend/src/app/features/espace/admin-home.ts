import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { MeService } from '../../core/services/me.service';
import { MONTHS_SHORT_FR, fromIso } from '../../shared/forms/dates';

interface Renewal { id: string; name: string; contractEnd: string; daysLeft: number; monthlyAmount: number | null; currency: string; }
interface Expired { id: string; name: string; contractEnd: string; activeAgents: number; }
interface Inactive { id: string; name: string; lastActivity: string | null; }
interface Day { day: string; signups: number; searches: number; offers: number; answers: number; }
interface AuditRow { actor: string; action: string; target: string | null; details: string | null; at: number; }
interface Agency { id: string; name: string; city: string | null; contractEnd: string | null; status: string; agents: number; maxAgents: number | null;
  activeProjects: number; searches30: number; lastActivity: string | null; plan: string | null; }
interface Home {
  alerts: { renewals: Renewal[]; expired: Expired[]; unreadMessages: number; unverifiedAccounts: number; blockedLogins24h: number; inactiveAgencies: Inactive[]; };
  days: Day[]; recent: AuditRow[]; agencies: Agency[]; actors: number; freelancers: number; agents: number; lastPurge: string | null;
}
interface Todo { tone: 'hot' | 'warn' | 'info'; title: string; text: string; link: string; query: Record<string, string>; cta: string; }
type Metric = 'signups' | 'searches' | 'offers' | 'answers';

/**
 * T-144 · Accueil de l'administrateur : ce qui demande une action, le pouls de la plateforme sur 14 jours,
 * les agences et leurs contrats, les dernières actions du journal.
 */
@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [RouterLink],
  template: `
  <div class="page">
    <header class="head">
      <div>
        <p class="hello">{{ greeting() }} · Administration de la plateforme</p>
        <h1>{{ firstName() || 'Accueil' }}</h1>
      </div>
      <div class="cta">
        <a class="btn ghost" routerLink="/admin">Tableau de bord complet</a>
        <a class="btn" routerLink="/admin" [queryParams]="{ onglet: 'agences' }">Gérer les agences</a>
      </div>
    </header>

    @if (loading()) {
      <div class="skel big"></div><div class="skel"></div>
    } @else if (error()) {
      <p class="field-msg" role="alert">{{ error() }}</p>
    } @else if (h(); as d) {
      <section class="block todo" aria-labelledby="h-todo">
        <div class="bh"><h2 id="h-todo">À traiter</h2><span class="count">{{ todos().length ? todos().length + ' point' + (todos().length > 1 ? 's' : '') : 'Rien à signaler' }}</span></div>
        @if (todos().length) {
          <ul class="todos">
            @for (t of todos(); track t.title) {
              <li [attr.data-t]="t.tone">
                <span class="mark" aria-hidden="true"></span>
                <div><b>{{ t.title }}</b><span>{{ t.text }}</span></div>
                <a class="btn sm ghost" [routerLink]="t.link" [queryParams]="t.query">{{ t.cta }}</a>
              </li>
            }
          </ul>
        } @else {
          <p class="ok"><span aria-hidden="true">✓</span> Contrats à jour, aucun message en attente, aucune connexion bloquée.</p>
        }
      </section>

      <section class="pulse" aria-label="Pouls de la plateforme sur 14 jours">
        @for (m of metrics; track m.key) {
          <button type="button" class="tile" [class.on]="metric() === m.key" (click)="metric.set(m.key)" [attr.aria-pressed]="metric() === m.key">
            <span class="k">{{ m.label }}</span>
            <b class="n">{{ sum(m.key, 7) }}</b>
            <span class="s">7 derniers jours {{ trend(m.key) }}</span>
            <svg class="spark" viewBox="0 0 140 36" preserveAspectRatio="none" aria-hidden="true">
              <polyline [attr.points]="spark(m.key)" />
            </svg>
          </button>
        }
      </section>

      <section class="block" aria-labelledby="h-chart">
        <div class="bh"><h2 id="h-chart">{{ metricLabel() }} · 14 jours</h2><span class="count">{{ sum(metric(), 14) }} au total</span></div>
        <div class="bars" role="img" [attr.aria-label]="chartLabel()">
          @for (x of d.days; track x.day) {
            <div class="col" [title]="dayShort(x.day) + ' : ' + x[metric()]">
              <span class="v">{{ x[metric()] || '' }}</span>
              <i [style.height.%]="pct(x[metric()])"></i>
              <span class="dl">{{ dayNum(x.day) }}</span>
            </div>
          }
        </div>
      </section>

      <div class="cols">
        <section class="block" aria-labelledby="h-ag">
          <div class="bh"><h2 id="h-ag">Agences</h2><a routerLink="/admin" [queryParams]="{ onglet: 'agences' }">Toutes</a></div>
          @if (d.agencies.length) {
            <ul class="agencies">
              @for (a of topAgencies(); track a.id) {
                <li>
                  <div class="a-main"><b>{{ a.name }}</b><span>{{ a.agents }}{{ a.maxAgents ? '/' + a.maxAgents : '' }} agent{{ a.agents > 1 ? 's' : '' }} · {{ a.activeProjects }} projet{{ a.activeProjects > 1 ? 's' : '' }} · {{ a.searches30 }} recherche{{ a.searches30 > 1 ? 's' : '' }} en 30 j</span></div>
                  <span class="st" [attr.data-s]="contractTone(a)">{{ contractLabel(a) }}</span>
                </li>
              }
            </ul>
          } @else { <p class="empty">Aucune agence encore.</p> }
        </section>

        <section class="block" aria-labelledby="h-log">
          <div class="bh"><h2 id="h-log">Dernières actions</h2><a routerLink="/admin" [queryParams]="{ onglet: 'journal' }">Journal</a></div>
          @if (d.recent.length) {
            <ol class="log">
              @for (r of d.recent; track $index) {
                <li><span class="dot" [attr.data-a]="r.action" aria-hidden="true"></span>
                  <div><b>{{ actionLabel(r.action) }}</b><span>{{ r.actor }}@if (r.target) { · {{ r.target }} }</span></div>
                  <time>{{ ago(r.at) }}</time></li>
              }
            </ol>
          } @else { <p class="empty">Le journal est vide.</p> }
        </section>
      </div>

      <p class="foot">{{ d.actors }} fiches d’acteurs · {{ d.freelancers }} comptes acteurs · {{ d.agents }} agents
        · Dernière purge de conservation : {{ d.lastPurge ? dateFr(d.lastPurge) : 'aucune donnée à effacer jusqu’ici' }}</p>
    }
  </div>
  `,
  styles: [`
  :host { display: block; }
  .page { max-width: 1120px; padding: 28px 32px 48px; display: flex; flex-direction: column; gap: 18px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
  .hello { color: var(--text-muted); font-size: 14px; }
  h1 { font-size: 40px; line-height: 1.05; margin-top: 2px; }
  .cta { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border-radius: var(--radius-s); border: 1px solid transparent;
    background: var(--accent); color: var(--on-accent); font-size: 14px; font-weight: 700; text-decoration: none; white-space: nowrap;
    &:hover { background: var(--accent-hover); } &.ghost { background: var(--glass); border-color: var(--border); color: var(--text-primary); &:hover { border-color: var(--accent); } }
    &.sm { height: 32px; padding: 0 12px; font-size: 12.5px; } &:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; } }
  .block { padding: 16px 18px; border-radius: var(--radius-l); border: 1px solid var(--border); background: var(--glass);
    -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }
  .bh { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 10px;
    h2 { font-size: 18px; font-stretch: 100%; } a { font-size: 13px; color: var(--accent-ink); } }
  .count { font-size: 13px; color: var(--text-muted); }
  ul, ol { list-style: none; margin: 0; padding: 0; }
  .todos li { display: grid; grid-template-columns: 6px 1fr auto; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border); }
  .todos li:first-child { border-top: none; }
  .todos .mark { width: 6px; height: 34px; border-radius: 3px; background: var(--text-subtle); }
  .todos li[data-t="hot"] .mark { background: var(--danger); } .todos li[data-t="warn"] .mark { background: var(--accent); }
  .todos div { display: flex; flex-direction: column; min-width: 0; b { font-size: 14.5px; } span { font-size: 13px; color: var(--text-muted); } }
  .ok { color: var(--text-muted); font-size: 14px; span { color: var(--success); font-weight: 800; margin-right: 6px; } }
  .pulse { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .tile { all: unset; box-sizing: border-box; cursor: pointer; display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: var(--radius-l);
    border: 1px solid var(--border); background: var(--glass); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); transition: border-color .15s;
    &:hover { border-color: var(--accent); } &.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--glass)); }
    &:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; } }
  .k { font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
  .n { font-size: 34px; line-height: 1; font-weight: 800; font-variant-numeric: tabular-nums; }
  .s { font-size: 12.5px; color: var(--text-muted); }
  .spark { width: 100%; height: 34px; margin-top: 4px; polyline { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; } }
  .bars { display: grid; grid-template-columns: repeat(14, 1fr); gap: 6px; align-items: end; height: 170px; }
  .col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 4px; min-width: 0;
    i { display: block; width: 100%; max-width: 34px; min-height: 2px; border-radius: 4px 4px 0 0; background: var(--accent); transition: height .5s cubic-bezier(.2,.8,.2,1); }
    .v { font-size: 11.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; min-height: 14px; } .dl { font-size: 11px; color: var(--text-subtle); } }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
  .agencies li, .log li { display: grid; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--border); }
  .agencies li:first-child, .log li:first-child { border-top: none; }
  .agencies li { grid-template-columns: 1fr auto; }
  .a-main { display: flex; flex-direction: column; min-width: 0; b { font-size: 14.5px; } span { font-size: 12.5px; color: var(--text-muted); } }
  .st { font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; background: var(--accent-dim);
    &[data-s="warn"] { background: var(--accent); color: var(--on-accent); } &[data-s="bad"] { background: color-mix(in srgb, var(--danger) 25%, transparent); }
    &[data-s="off"] { background: var(--bg-hover); color: var(--text-muted); } }
  .log li { grid-template-columns: 8px 1fr auto; }
  .log .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-subtle); }
  .log .dot[data-a="CONNEXION_BLOQUEE"] { background: var(--danger); } .log .dot[data-a^="AGENCE"], .log .dot[data-a^="CONTRAT"] { background: var(--accent); }
  .log div { display: flex; flex-direction: column; min-width: 0; b { font-size: 14px; } span { font-size: 12.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
  time { font-size: 12px; color: var(--text-subtle); white-space: nowrap; }
  .empty { color: var(--text-muted); font-size: 14px; }
  .foot { font-size: 12.5px; color: var(--text-subtle); }
  .skel { height: 120px; border-radius: var(--radius-l); background: var(--bg-hover); } .skel.big { height: 200px; }
  @container page (max-width: 900px) { .pulse { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cols { grid-template-columns: 1fr; } }
  @container page (max-width: 560px) {
    .page { padding: 20px 16px 32px; } h1 { font-size: 32px; } .n { font-size: 28px; }
    .todos li { grid-template-columns: 6px 1fr; } .todos .btn { grid-column: 2; justify-self: start; }
    .bars { gap: 3px; height: 140px; } .col .v { display: none; } .cta { width: 100%; } .cta .btn { flex: 1; justify-content: center; }
  }
  @media (prefers-reduced-motion: reduce) { .col i { transition: none; } }
  `]
})
export class AdminHomeComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly me = inject(MeService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly h = signal<Home | null>(null);
  readonly metric = signal<Metric>('signups');
  readonly metrics: { key: Metric; label: string }[] = [
    { key: 'signups', label: 'Inscriptions d’acteurs' }, { key: 'searches', label: 'Recherches IA' },
    { key: 'offers', label: 'Propositions envoyées' }, { key: 'answers', label: 'Réponses d’acteurs' }
  ];
  readonly firstName = computed(() => this.me.me()?.firstName ?? '');
  readonly metricLabel = computed(() => this.metrics.find(m => m.key === this.metric())!.label);
  readonly topAgencies = computed(() => [...(this.h()?.agencies ?? [])]
    .sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '')).slice(0, 6));

  readonly todos = computed<Todo[]>(() => {
    const a = this.h()?.alerts; if (!a) return [];
    const t: Todo[] = [];
    for (const e of a.expired) t.push({ tone: 'hot', title: `Contrat échu : ${e.name}`, text: `Terminé le ${this.dateFr(e.contractEnd)} · ${e.activeAgents} agent${e.activeAgents > 1 ? 's' : ''} encore actif${e.activeAgents > 1 ? 's' : ''} (consultation seule)`, link: '/admin', query: { onglet: 'agences' }, cta: 'Renouveler' });
    for (const r of a.renewals) t.push({ tone: r.daysLeft <= 7 ? 'hot' : 'warn', title: `Contrat à renouveler : ${r.name}`, text: r.daysLeft <= 0 ? 'Se termine aujourd’hui' : `Se termine dans ${r.daysLeft} jour${r.daysLeft > 1 ? 's' : ''} (${this.dateFr(r.contractEnd)})`, link: '/admin', query: { onglet: 'agences' }, cta: 'Voir le contrat' });
    if (a.unreadMessages) t.push({ tone: 'warn', title: `${a.unreadMessages} message${a.unreadMessages > 1 ? 's' : ''} de contact non lu${a.unreadMessages > 1 ? 's' : ''}`, text: 'Envoyés depuis la vitrine : agences intéressées, acteurs, partenaires', link: '/admin', query: { onglet: 'messages' }, cta: 'Lire' });
    if (a.blockedLogins24h) t.push({ tone: 'hot', title: `${a.blockedLogins24h} connexion${a.blockedLogins24h > 1 ? 's' : ''} bloquée${a.blockedLogins24h > 1 ? 's' : ''} en 24 h`, text: 'Trop d’essais de mot de passe : vérifier s’il s’agit d’une attaque', link: '/admin', query: { onglet: 'journal', action: 'CONNEXION_BLOQUEE' }, cta: 'Voir le journal' });
    if (a.unverifiedAccounts) t.push({ tone: 'info', title: `${a.unverifiedAccounts} compte${a.unverifiedAccounts > 1 ? 's' : ''} sans adresse vérifiée`, text: 'Envoyer un lien de vérification depuis Équipe et comptes', link: '/admin', query: { onglet: 'equipe', filtre: 'UNVERIF' }, cta: 'Voir les comptes' });
    for (const i of a.inactiveAgencies) t.push({ tone: 'info', title: `Agence inactive : ${i.name}`, text: i.lastActivity ? `Aucune activité depuis le ${this.dateFr(i.lastActivity.slice(0, 10))}` : 'Aucune activité depuis le début du contrat : proposer un accompagnement', link: '/admin', query: { onglet: 'agences' }, cta: 'Voir' });
    return t;
  });

  ngOnInit(): void {
    if (!this.me.me()) this.me.load().subscribe({ error: () => {} });
    this.http.get<Home>(`${environment.apiUrl}/admin/home`).subscribe({
      next: d => { this.h.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger l’accueil. Rechargez la page.'); }
    });
  }

  private values(m: Metric): number[] { return (this.h()?.days ?? []).map(d => d[m]); }
  sum(m: Metric, last: number): number { return this.values(m).slice(-last).reduce((a, b) => a + b, 0); }
  trend(m: Metric): string {
    const cur = this.sum(m, 7), prev = this.values(m).slice(0, 7).reduce((a, b) => a + b, 0);
    if (!cur && !prev) return ''; if (!prev) return '· nouveau';
    const p = Math.round((cur - prev) / prev * 100); return p === 0 ? '· stable' : `· ${p > 0 ? '+' : ''}${p} %`;
  }
  spark(m: Metric): string {
    const v = this.values(m); const max = Math.max(1, ...v);
    return v.map((x, i) => `${(i / Math.max(1, v.length - 1) * 140).toFixed(1)},${(34 - x / max * 30).toFixed(1)}`).join(' ');
  }
  pct(x: number): number { const max = Math.max(1, ...this.values(this.metric())); return x / max * 100; }
  chartLabel(): string { return `${this.metricLabel()} par jour sur 14 jours : ${this.values(this.metric()).join(', ')}`; }
  dayNum(iso: string): number { return fromIso(iso)?.getDate() ?? 0; }
  dayShort(iso: string): string { const d = fromIso(iso); return d ? `${d.getDate()} ${MONTHS_SHORT_FR[d.getMonth()]}` : iso; }
  dateFr(iso: string): string { const d = fromIso(iso.slice(0, 10)); return d ? `${d.getDate()} ${MONTHS_SHORT_FR[d.getMonth()]} ${d.getFullYear()}` : iso; }
  contractTone(a: Agency): string {
    if (a.status === 'EXPIRE') return 'bad'; if (a.status === 'A_VENIR') return 'off';
    if (a.contractEnd) { const d = fromIso(a.contractEnd); if (d && (d.getTime() - Date.now()) / 864e5 <= 30) return 'warn'; }
    return 'ok';
  }
  contractLabel(a: Agency): string {
    if (a.status === 'EXPIRE') return 'Contrat échu'; if (a.status === 'A_VENIR') return 'À venir';
    if (!a.contractEnd) return 'Sans échéance';
    const d = fromIso(a.contractEnd)!; const left = Math.ceil((d.getTime() - Date.now()) / 864e5);
    return left <= 30 ? `Fin dans ${left} j` : `Jusqu’au ${this.dateFr(a.contractEnd)}`;
  }
  actionLabel(a: string): string {
    return ({ COMPTE_CREE: 'Compte créé', COMPTE_MODIFIE: 'Compte modifié', AGENCE_CREEE: 'Agence ajoutée', CONTRAT_MODIFIE: 'Contrat modifié',
      IMPORT: 'Import d’acteurs', CONNEXION_BLOQUEE: 'Connexion bloquée', PURGE_CONSERVATION: 'Purge de conservation',
      EXPORT_DONNEES: 'Export de données', COMPTE_SUPPRIME: 'Compte supprimé', LIEN_REINITIALISATION: 'Lien de mot de passe',
      LIEN_VERIFICATION_EMAIL: 'Lien de vérification d’e-mail', INVITATION_ACTEUR: 'Invitation d’acteur', INVITATION_ANNULEE: 'Invitation annulée',
      INVITATION_ACCEPTEE: 'Invitation acceptée', EMAIL_VERIFIE: 'Adresse e-mail vérifiée', MOT_DE_PASSE_REINITIALISE: 'Mot de passe réinitialisé' } as Record<string, string>)[a] ?? a.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
  }
  greeting(): string { const h = new Date().getHours(); return h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour'; }
  ago(ms: number): string {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 60) return m < 1 ? 'à l’instant' : `il y a ${m} min`;
    const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`;
    const d = Math.round(h / 24); return d === 1 ? 'hier' : `il y a ${d} j`;
  }
}
