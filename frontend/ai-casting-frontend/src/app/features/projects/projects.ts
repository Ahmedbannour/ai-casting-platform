import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Project, ProjectService, ProjectStatus, typeLabel } from '../../core/services/project.service';
import { ProjectFormComponent } from './project-form';

/** Liste des projets de casting (US-02) avec création (US-01) et archivage (US-03). */
@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [ProjectFormComponent],
  templateUrl: './projects.html',
  styleUrl: './projects.scss'
})
export class ProjectsComponent implements OnInit {
  private readonly service = inject(ProjectService);
  private readonly router = inject(Router);

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

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.service.list().subscribe({
      next: list => { this.all.set(list); this.loading.set(false); this.error.set(''); },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger les projets. Vérifiez que le serveur est lancé.'); }
    });
  }

  openCreate(): void { this.editing.set(null); this.formOpen.set(true); }
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
