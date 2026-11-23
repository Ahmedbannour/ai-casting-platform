import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { LiveService } from '../../core/services/live.service';
import { Router, RouterLink } from '@angular/router';
import { DemandeService, DemandeSummary, STATUS_LABEL } from '../../core/services/demande.service';
import { AuthService } from '../../core/services/auth.service';
import { MeService } from '../../core/services/me.service';
import { Project, ProjectService, ProjectStatus, typeLabel } from '../../core/services/project.service';
import { ProjectFormComponent } from './project-form';

/** Liste des projets de casting (US-02) avec création (US-01) et archivage (US-03). */
@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [ProjectFormComponent, RouterLink],
  templateUrl: './projects.html',
  styleUrl: './projects.scss'
})
export class ProjectsComponent implements OnInit {
  private readonly service = inject(ProjectService);
  private readonly router = inject(Router);
  private readonly demandes = inject(DemandeService);
  private readonly auth = inject(AuthService);
  private readonly me = inject(MeService);
  /** Le producer (et l'assistante autorisée) choisit entre une publicité (marque et agence) et un autre projet. */
  readonly canAd = computed(() => { const r = this.me.me()?.role ?? this.auth.role();
    return r === 'BOITE_PROD' || r === 'ADMIN' || (r === 'ASSISTANT_PROD' && this.me.can('PROJETS')); });
  readonly choice = signal(false);

  /** Publicités en préparation (avant la V2 publiée) : pas encore de projet de casting, mais l'équipe les suit d'ici. */
  readonly pubs = signal<DemandeSummary[]>([]);
  readonly statusLabel = STATUS_LABEL;
  private loadPubs(): void {
    const role = this.auth.role();
    if (role !== 'BOITE_PROD' && role !== 'REALISATEUR' && role !== 'ADMIN') return;
    const before = ['BROUILLON', 'V0_ENVOYEE', 'V1_EN_COURS', 'V1_LIVREE', 'V2_EN_COURS'];
    this.demandes.mine().subscribe({ next: l => this.pubs.set(l.filter(d => before.includes(d.status))), error: () => this.pubs.set([]) });
  }

  readonly tabs: { value: ProjectStatus; label: string }[] = [
    { value: 'EN_COURS', label: 'En cours' },
    { value: 'TERMINE', label: 'Terminés' },
    { value: 'ARCHIVE', label: 'Archivés' }
  ];
  readonly tab = signal<ProjectStatus>('EN_COURS');
  readonly all = signal<Project[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly formOpen = signal(false);
  readonly editing = signal<Project | null>(null);

  readonly visible = computed(() => this.all().filter(p => p.status === this.tab()));
  readonly countBy = computed(() => {
    const c: Record<ProjectStatus, number> = { EN_COURS: 0, TERMINE: 0, ARCHIVE: 0 };
    for (const p of this.all()) c[p.status]++;
    return c;
  });

  typeLabel = typeLabel;

  private readonly live = inject(LiveService);
  private readonly destroyRef = inject(DestroyRef);
  ngOnInit(): void { this.load(); this.loadPubs(); this.live.watch(this.destroyRef, () => { this.load(true); this.loadPubs(); }); }

  load(silent = false): void {
    if (!silent) this.loading.set(true);
    this.service.list().subscribe({
      next: list => { this.all.set(list); this.loading.set(false); this.error.set(''); },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger les projets. Vérifiez que le serveur est lancé.'); }
    });
  }

  openCreate(): void { this.choice.set(false); this.editing.set(null); this.formOpen.set(true); }
  newProject(): void { if (this.canAd()) this.choice.update(v => !v); else this.openCreate(); }
  newAd(): void { this.choice.set(false); this.router.navigate(['/demandes/nouvelle']); }
  openEdit(p: Project, e: Event): void { e.stopPropagation(); this.editing.set(p); this.formOpen.set(true); }

  onSaved(p: Project): void {
    const wasNew = !this.editing();
    this.formOpen.set(false);
    if (wasNew) { this.router.navigate(['/projects', p.id]); return; }   // US-01 : on arrive sur le projet
    this.all.update(list => list.map(x => x.id === p.id ? p : x));
  }

  archive(p: Project, e: Event): void { e.stopPropagation(); this.service.archive(p.id).subscribe(u => this.replace(u)); }
  restore(p: Project, e: Event): void { e.stopPropagation(); this.service.restore(p.id).subscribe(u => this.replace(u)); }

  open(p: Project): void { this.router.navigate(['/projects', p.id]); }

  dates(p: Project): string {
    const f = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    if (p.startDate && p.endDate) return `${f(p.startDate)} → ${f(p.endDate)}`;
    if (p.startDate) return `À partir du ${f(p.startDate)}`;
    if (p.endDate) return `Jusqu'au ${f(p.endDate)}`;
    return 'Dates à définir';
  }

  progress(p: Project): number { return p.rolesCount ? Math.round(100 * p.rolesFilled / p.rolesCount) : 0; }

  private replace(p: Project): void { this.all.update(list => list.map(x => x.id === p.id ? p : x)); }
}
