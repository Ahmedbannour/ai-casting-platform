import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { LiveService } from '../../core/services/live.service';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MeService } from '../../core/services/me.service';
import { AuthService } from '../../core/services/auth.service';
import { DemandeService, DemandeSummary, STATUS_LABEL } from '../../core/services/demande.service';

interface Step { key: string; who: string; what: string; }

/**
 * Espace de la marque et de l'agence marketing (cahier des charges v2, sprint 1).
 * Montre où se place le compte dans le cycle V0 → V1 → V2 → propositions d'acteurs.
 * Sprint 2 : liste des demandes (marque : les siennes ; agence : celles reçues). La V1 arrive au sprint 3.
 */
@Component({
  selector: 'app-mes-demandes',
  standalone: true,
  imports: [RouterLink, DatePipe],
  template: `
  <section class="page">
    <header class="head">
      <h1>{{ isProd() ? 'Publicités' : 'Mes demandes' }}</h1>
      <p>{{ lead() }}</p>
    </header>

    <ol class="cycle" aria-label="Le cycle d'une demande de publicité">
      @for (s of steps; track s.key; let i = $index) {
        <li [class.mine]="s.key === mine()">
          <span class="n" aria-hidden="true">{{ i + 1 }}</span>
          <div><b>{{ s.who }}</b><span>{{ s.what }}</span></div>
          @if (s.key === mine()) { <em>Vous êtes ici</em> }
        </li>
      }
    </ol>

    @if (loading()) {
      <p class="muted">Chargement des demandes…</p>
    } @else if (error()) {
      <p class="err" role="alert">{{ error() }}</p>
    } @else if (list().length) {
      <div class="bar">
        <h2>{{ list().length }} demande{{ list().length > 1 ? 's' : '' }}</h2>
        @if (canCreate()) { <a class="send" routerLink="/demandes/nouvelle">Nouveau projet</a> }
      </div>
      <ul class="list">
        @for (d of list(); track d.id) {
          <li>
            <a [routerLink]="['/demandes', d.id]">
              <div class="t"><b>{{ d.title }}</b>
                <span>{{ isMarque() ? (d.agencyName ? 'Agence : ' + d.agencyName : 'Pas encore envoyée') : (isProd() || isDirector()) ? 'Marque : ' + d.brandName + (d.agencyName ? ' · agence ' + d.agencyName : '') : 'Marque : ' + d.brandName }}{{ d.product ? ' · ' + d.product : '' }}</span>
                <span class="now"><i aria-hidden="true"></i>{{ d.nowWho ? d.nowWho + ' ' : '' }}{{ d.nowWhat }}</span>
              </div>
              <span class="st" [attr.data-s]="d.status">{{ label(d.status) }}</span>
              <time>{{ d.updatedAt | date:'d MMM' }}</time>
            </a>
          </li>
        }
      </ul>
    } @else {
      <div class="empty">
        <h2>Aucune demande pour l'instant</h2>
        @if (canCreate()) {
          <p>Créez votre premier projet de publicité, puis invitez la marque et l'agence marketing. La marque déposera sa V0, l'agence livrera la V1, et vous suivrez chaque étape jusqu'au casting.</p>
          <a class="send" routerLink="/demandes/nouvelle">Nouveau projet</a>
        } @else if (isMarque()) {
          <p>Les projets sur lesquels une boîte de production vous invite arriveront ici. Vous y déposerez votre V0 : le fichier artistique de votre idée (détails, messages, notes ; PDF, Word ou PowerPoint). Pas de budget dans la V0.</p>
        } @else if (isDirector()) {
          <p>Les publicités auxquelles une boîte de production vous rattache arriveront ici. Vous suivrez leur avancement, puis écrirez la V2 dès que les attentes vous seront transmises.</p>
        } @else if (isProd()) {
          <p>Les projets de votre boîte de production arriveront ici. Le producer vous ouvre la création des projets quand il le souhaite.</p>
        } @else {
          <p>Les demandes que les marques vous envoient arriveront ici, avec leur V0. Vous recevrez une notification à chaque nouvelle demande.</p>
        }
      </div>
    }
  </section>`,
  styles: [`
    :host { display: block; }
    .page { padding: 24px 32px 48px; max-width: 980px; display: flex; flex-direction: column; gap: 20px; }
    .head h1 { font-size: 38px; line-height: 1.05; margin: 0; }
    .head p { margin: 6px 0 0; color: var(--text-muted); font-size: 14.5px; max-width: 64ch; }
    .cycle { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .cycle li { position: relative; display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 14px;
      border: 1px solid var(--border); background: var(--glass, transparent); min-width: 0; }
    .cycle li.mine { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
    .n { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 700;
      background: var(--bg-hover); color: var(--text-primary); }
    .mine .n { background: var(--accent); color: var(--on-accent); }
    .cycle b { display: block; font-size: 14px; }
    .cycle span:not(.n) { display: block; margin-top: 2px; color: var(--text-muted); font-size: 13px; line-height: 1.4; }
    .cycle em { font-style: normal; font-size: 12px; font-weight: 600; color: var(--accent-ink); }
    .empty { padding: 28px; border-radius: 16px; border: 1px dashed var(--border); display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
    .empty h2 { margin: 0; font-size: 20px; }
    .empty p { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.5; max-width: 62ch; }
    .muted { color: var(--text-muted); margin: 0; }
    .err { color: var(--danger); margin: 0; }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .bar h2 { margin: 0; font-size: 18px; }
    .send { display: inline-flex; align-items: center; height: 40px; padding: 0 18px; border-radius: 10px; border: 0; background: var(--accent);
      color: #111; font: inherit; font-size: 14px; font-weight: 700; text-decoration: none; cursor: pointer; }
    .send:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 2px; }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .list a { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 14px; padding: 14px 16px;
      border-radius: 12px; border: 1px solid var(--border); color: inherit; text-decoration: none; }
    .list a:hover { background: var(--bg-hover); }
    .t b { display: block; font-size: 15px; }
    .t .now { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); font-weight: 500; }
    .t .now i { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
    .t span { display: block; color: var(--text-muted); font-size: 13px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .st { font-size: 12.5px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: var(--bg-hover); white-space: nowrap; }
    .st[data-s="V0_ENVOYEE"] { background: color-mix(in srgb, var(--accent) 22%, transparent); }
    .st[data-s="ANNULEE"] { color: var(--text-muted); text-decoration: line-through; }
    time { color: var(--text-muted); font-size: 12.5px; }
    .soon { height: 40px; padding: 0 18px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--text-muted);
      font: inherit; font-size: 14px; font-weight: 600; cursor: not-allowed; }
    @media (max-width: 900px) { .list a { grid-template-columns: minmax(0,1fr) auto; } time { display: none; } .page { padding: 18px 14px 24px; gap: 16px; } .head h1 { font-size: 30px; }
      /* Sur téléphone, le cycle tient en quatre lignes compactes (numéro + rôle + ce qu'il fait). */
      .cycle { grid-template-columns: 1fr; gap: 6px; }
      .cycle li { flex-direction: row; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; }
      .cycle li > div { flex: 1; min-width: 0; }
      .cycle b { font-size: 13.5px; } .cycle span:not(.n) { font-size: 12.5px; line-height: 1.35; }
      .n { flex: none; }
      .cycle em { flex: none; font-size: 11px; padding: 3px 8px; border-radius: 999px; background: var(--accent-dim); } }
  `]
})
export class MesDemandesComponent {
  private readonly demandes = inject(DemandeService);
  readonly list = signal<DemandeSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly label = (s: keyof typeof STATUS_LABEL) => STATUS_LABEL[s];
  constructor() {
    this.load();
    // Un autre rôle crée, invite ou fait avancer un projet : la liste se met à jour seule
    inject(LiveService).watch(inject(DestroyRef), () => this.load(true));
  }
  private load(silent = false): void {
    this.demandes.mine().subscribe({
      next: l => { this.list.set(l); this.loading.set(false); this.error.set(''); },
      error: () => { if (!silent) this.error.set('Impossible de charger vos demandes. Réessayez dans un instant.'); this.loading.set(false); }
    });
  }
  private readonly me = inject(MeService);
  private readonly auth = inject(AuthService);
  private readonly role = computed(() => this.me.me()?.role ?? this.auth.role());
  readonly isMarque = computed(() => this.role() === 'MARQUE' || this.role() === 'ADMIN');
  readonly isProd = computed(() => this.role() === 'BOITE_PROD' || this.role() === 'ASSISTANT_PROD');
  /** Le producer crée les projets ; son assistante aussi, s'il le lui autorise. */
  readonly canCreate = computed(() => this.role() === 'BOITE_PROD' || this.role() === 'ADMIN' || (this.role() === 'ASSISTANT_PROD' && this.me.can('PROJETS')));
  readonly isDirector = computed(() => this.role() === 'REALISATEUR');
  readonly mine = computed(() => this.role() === 'AGENCE_MARKETING' ? 'v1' : this.isProd() ? 'projet' : this.isDirector() ? 'v2' : 'v0');
  readonly lead = computed(() => this.isDirector()
    ? 'Une boîte de production vous rattache à ses publicités : vous suivez leur avancement, puis vous écrivez la V2 et l’intention de chaque rôle dès que les attentes vous sont transmises.'
    : this.isProd()
    ? 'Vous créez les projets et invitez la marque et l’agence marketing. Vous suivez chaque étape, rattachez votre réalisateur, puis recueillez les attentes sur les profils une fois la V1 validée.'
    : this.isMarque()
    ? 'La boîte de production vous invite sur ses projets : vous déposez l’idée de votre publicité (V0) ; l’agence, la production et le réalisateur la font avancer jusqu’aux acteurs validés en PPM.'
    : 'Vous recevez la V0 des marques et livrez la V1 : le concept que le réalisateur détaillera.');
  readonly steps: Step[] = [
    { key: 'projet', who: 'Producer', what: 'crée le projet, invite la marque et l’agence' },
    { key: 'v0', who: 'Marque', what: 'dépose la V0 : le fichier artistique' },
    { key: 'v1', who: 'Agence marketing', what: 'analyse la V0, livre la V1 : le concept' },
    { key: 'attentes', who: 'Boîte de production', what: 'recueille vos attentes sur les profils' },
    { key: 'v2', who: 'Réalisateur et 1er AD', what: 'écrivent la V2 et l’intention de chaque rôle' },
    { key: 'ia', who: 'Cercle', what: 'propose des acteurs pour chaque intention' },
    { key: 'ppm', who: 'PPM', what: 'tous valident ensemble le casting, les décors, les costumes' }
  ];
}
