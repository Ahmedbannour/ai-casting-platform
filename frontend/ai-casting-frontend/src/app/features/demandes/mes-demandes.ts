import { Component, computed, inject } from '@angular/core';
import { MeService } from '../../core/services/me.service';
import { AuthService } from '../../core/services/auth.service';

interface Step { key: string; who: string; what: string; }

/**
 * Espace de la marque et de l'agence marketing (cahier des charges v2, sprint 1).
 * Montre où se place le compte dans le cycle V0 → V1 → V2 → propositions d'acteurs.
 * La création des demandes arrive au sprint 2 (marque) et la V1 au sprint 3 (agence).
 */
@Component({
  selector: 'app-mes-demandes',
  standalone: true,
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

    <div class="empty">
      <h2>Aucune demande pour l'instant</h2>
      @if (isMarque()) {
        <p>Vous pourrez créer une demande de publicité et déposer votre V0, le fichier artistique de votre idée (détails du projet, messages, notes ; PDF, Word ou PowerPoint), à partir du 30 novembre.</p>
        <button type="button" class="soon" disabled>Nouvelle demande · bientôt</button>
      } @else {
        <p>Les demandes que les marques vous envoient arriveront ici. Vous pourrez analyser chaque V0 avec l'aide de l'IA et livrer votre V1 à partir du 7 décembre.</p>
      }
    </div>
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
    .soon { height: 40px; padding: 0 18px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--text-muted);
      font: inherit; font-size: 14px; font-weight: 600; cursor: not-allowed; }
    @media (max-width: 900px) { .cycle { grid-template-columns: 1fr; } .page { padding: 18px 14px 104px; } .head h1 { font-size: 30px; } }
  `]
})
export class MesDemandesComponent {
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
