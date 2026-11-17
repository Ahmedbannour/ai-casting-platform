import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActivityItem, CastingService, STATUSES } from '../../core/services/casting.service';

/** Journal d'activité du projet (US-17) : qui a fait avancer quel acteur, et quand. */
@Component({
  selector: 'app-project-activity',
  standalone: true,
  imports: [RouterLink],
  template: `
  @if (items().length) {
    <ol class="log">
      @for (i of items(); track $index) {
        <li>
          <span class="when">{{ when(i.at) }}</span>
          <span class="what">
            <b>{{ i.userName || 'Quelqu’un' }}</b>
            @if (!i.fromStatus) { a ajouté <a [routerLink]="['/actors', i.actorId]">{{ i.actorName }}</a> à la shortlist }
            @else { a passé <a [routerLink]="['/actors', i.actorId]">{{ i.actorName }}</a> de « {{ label(i.fromStatus) }} » à « {{ label(i.toStatus) }} » }
            du rôle <a [routerLink]="['/roles', i.roleId]">{{ i.roleName }}</a>
          </span>
        </li>
      }
    </ol>
  } @else if (loaded()) {
    <p class="empty">Rien pour l’instant : chaque ajout à une shortlist et chaque changement de statut apparaîtra ici.</p>
  }
  `,
  styles: [`
  .log { list-style: none; position: relative; display: flex; flex-direction: column; gap: 2px; padding-left: 18px; }
  .log::before { content: ''; position: absolute; left: 5px; top: 8px; bottom: 8px; width: 2px; background: var(--border); }
  li { position: relative; display: flex; gap: 14px; align-items: baseline; padding: 8px 10px; border-radius: var(--radius-s); }
  li::before { content: ''; position: absolute; left: -17px; top: 14px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--bg-primary); }
  li:hover { background: var(--glass); }
  .when { flex: none; width: 112px; font-size: 12.5px; color: var(--text-subtle); font-variant-numeric: tabular-nums; }
  .what { font-size: 14px; color: var(--text-muted); line-height: 1.5; b { color: var(--text-primary); } a { color: var(--text-primary); font-weight: 600; text-decoration: none; } a:hover { text-decoration: underline; } }
  .empty { color: var(--text-muted); font-size: 14px; }
  @media (max-width: 600px) { li { flex-direction: column; gap: 2px; } }
  `]
})
export class ProjectActivityComponent implements OnInit {
  @Input({ required: true }) projectId = '';
  private readonly casting = inject(CastingService);
  readonly items = signal<ActivityItem[]>([]);
  readonly loaded = signal(false);

  ngOnInit(): void {
    this.casting.activity(this.projectId).subscribe({ next: a => { this.items.set(a); this.loaded.set(true); }, error: () => this.loaded.set(true) });
  }

  label(s: string): string {
    const one: Record<string, string> = { PRESELECTIONNE: 'présélectionné', AUDITION: 'audition', RAPPEL: 'rappel', CHOISI: 'choisi', REFUSE: 'refusé' };
    return one[s] ?? STATUSES.find(x => x.value === s)?.label ?? s;
  }

  when(at: string): string {
    const d = new Date(at);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
}
