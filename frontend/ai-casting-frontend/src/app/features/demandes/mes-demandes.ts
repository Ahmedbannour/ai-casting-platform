import { Component, computed, inject, signal } from '@angular/core';
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
      <h1>Mes demandes</h1>
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
        @if (isMarque()) { <a class="send" routerLink="/demandes/nouvelle">Nouvelle demande</a> }
      </div>
      <ul class="list">
        @for (d of list(); track d.id) {
          <li>
            <a [routerLink]="['/demandes', d.id]">
              <div class="t"><b>{{ d.title }}</b>
                <span>{{ isMarque() ? (d.agencyName ? 'Agence : ' + d.agencyName : 'Pas encore envoyée') : 'Marque : ' + d.brandName }}{{ d.product ? ' · ' + d.product : '' }}</span>
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
        @if (isMarque()) {
          <p>Créez une demande de publicité et déposez votre V0 : le fichier artistique de votre idée (détails du projet, messages, notes ; PDF, Word ou PowerPoint). Pas de budget dans la V0.</p>
          <a class="send" routerLink="/demandes/nouvelle">Nouvelle demande</a>
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
    .mine .n { background: var(--accent); color: #111; }
    .cycle b { display: block; font-size: 14px; }
    .cycle span:not(.n) { display: block; margin-top: 2px; color: var(--text-muted); font-size: 13px; line-height: 1.4; }
    .cycle em { font-style: normal; font-size: 12px; font-weight: 600; color: var(--accent); }
    .empty { padding: 28px; border-radius: 16px; border: 1px dashed var(--border); display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
    .empty h2 { margin: 0; font-size: 20px; }
    .empty p { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.5; max-width: 62ch; }
    .muted { color: var(--text-muted); margin: 0; }
    .err { color: #e5484d; margin: 0; }
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
    .t span { display: block; color: var(--text-muted); font-size: 13px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .st { font-size: 12.5px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: var(--bg-hover); white-space: nowrap; }
    .st[data-s="V0_ENVOYEE"] { background: color-mix(in srgb, var(--accent) 22%, transparent); }
    .st[data-s="ANNULEE"] { color: var(--text-muted); text-decoration: line-through; }
    time { color: var(--text-muted); font-size: 12.5px; }
    .soon { height: 40px; padding: 0 18px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--text-muted);
      font: inherit; font-size: 14px; font-weight: 600; cursor: not-allowed; }
    @media (max-width: 900px) { .list a { grid-template-columns: minmax(0,1fr) auto; } time { display: none; } .cycle { grid-template-columns: 1fr; } .page { padding: 18px 14px 104px; } .head h1 { font-size: 30px; } }
  `]
})
export class MesDemandesComponent {
  private readonly demandes = inject(DemandeService);
  readonly list = signal<DemandeSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly label = (s: keyof typeof STATUS_LABEL) => STATUS_LABEL[s];
  constructor() {
    this.demandes.mine().subscribe({
      next: l => { this.list.set(l); this.loading.set(false); },
      error: () => { this.error.set('Impossible de charger vos demandes. Réessayez dans un instant.'); this.loading.set(false); }
    });
  }
  private readonly me = inject(MeService);
  private readonly auth = inject(AuthService);
  private readonly role = computed(() => this.me.me()?.role ?? this.auth.role());
  readonly isMarque = computed(() => this.role() !== 'AGENCE_MARKETING');
  readonly mine = computed(() => this.role() === 'AGENCE_MARKETING' ? 'v1' : 'v0');
  readonly lead = computed(() => this.isMarque()
    ? 'Vous déposez l’idée de votre publicité (V0) ; l’agence, la production et le réalisateur la font avancer jusqu’aux acteurs validés en PPM.'
    : 'Vous recevez la V0 des marques et livrez la V1 : le concept que le réalisateur détaillera.');
  readonly steps: Step[] = [
    { key: 'v0', who: 'Marque', what: 'dépose la V0 : le fichier artistique' },
    { key: 'v1', who: 'Agence marketing', what: 'analyse la V0, livre la V1 : le concept' },
    { key: 'attentes', who: 'Boîte de production', what: 'recueille vos attentes sur les profils' },
    { key: 'v2', who: 'Réalisateur et 1er AD', what: 'écrivent la V2 et l’intention de chaque rôle' },
    { key: 'ia', who: 'AI Casting', what: 'propose des acteurs pour chaque intention' },
    { key: 'ppm', who: 'PPM', what: 'tous valident ensemble le casting, les décors, les costumes' }
  ];
}
