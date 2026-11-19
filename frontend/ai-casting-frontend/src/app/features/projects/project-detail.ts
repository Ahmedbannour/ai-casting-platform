import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Project, ProjectService, typeLabel } from '../../core/services/project.service';
import { CastingRole, CastingService, criteria, importanceLabel } from '../../core/services/casting.service';
import { ProjectFormComponent } from './project-form';
import { RoleFormComponent } from './role-form';
import { ProjectTeamComponent } from './project-team';
import { ProjectActivityComponent } from './project-activity';

/** Page d'un projet : en-tête, état, puis ses rôles (US-05 à US-08). */
@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [RouterLink, ProjectFormComponent, RoleFormComponent, ProjectTeamComponent, ProjectActivityComponent],
  template: `
  <div class="page">
    <a routerLink="/projects" class="back"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg> Projets</a>

    @if (project(); as p) {
      <header class="head">
        <div>
          <div class="meta">
            <span class="tag">{{ typeLabel(p.type) }}</span>
            <span class="tag" [class.live]="p.status === 'EN_COURS'">{{ statusLabel(p) }}</span>
          </div>
          <h1>{{ p.title }}</h1>
          <p class="dates">{{ dates(p) }}</p>
          @if (p.description) { <p class="desc">{{ p.description }}</p> }
        </div>
        <div class="head-side">
          <div class="progress" [attr.aria-label]="filledCount() + ' rôles pourvus sur ' + roles().length">
            <b>{{ filledCount() }} / {{ roles().length }}</b> rôle{{ roles().length > 1 ? 's' : '' }} pourvu{{ filledCount() > 1 ? 's' : '' }}
            <div class="bar"><span [style.width.%]="roles().length ? 100 * filledCount() / roles().length : 0"></span></div>
          </div>
          <div class="actions">
            <button type="button" class="btn-ghost" (click)="editOpen.set(true)">Modifier</button>
            @if (p.status === 'ARCHIVE') {
              <button type="button" class="btn-ghost" (click)="restore()">Restaurer</button>
            } @else {
              @if (p.status === 'EN_COURS') { <button type="button" class="btn-ghost" (click)="finish()">Marquer terminé</button> }
              <button type="button" class="btn-ghost" (click)="archive()">Archiver</button>
            }
          </div>
        </div>
      </header>

      <div class="tabs" role="tablist" aria-label="Sections du projet">
        @for (t of tabs; track t.id) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.id" [class.on]="tab() === t.id" (click)="tab.set(t.id)">
            {{ t.label }}@if (t.id === 'roles') { <span class="n">{{ roles().length }}</span> }
          </button>
        }
      </div>

      @if (tab() === 'equipe') {
        <section class="pane"><app-project-team [projectId]="p.id" [canManage]="p.owner" /></section>
      }
      @if (tab() === 'journal') {
        <section class="pane"><app-project-activity [projectId]="p.id" /></section>
      }

      <section class="roles" [hidden]="tab() !== 'roles'">
        <div class="roles-head">
          <h2>Rôles</h2>
          @if (roles().length) {
            <button type="button" class="btn-primary" (click)="openRole(null)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
              Nouveau rôle
            </button>
          }
        </div>

        @if (!roles().length && rolesLoaded()) {
          <div class="empty">
            <span class="brand-mark big" aria-hidden="true"></span>
            <h3>Ajoutez un premier rôle</h3>
            <p>Écrivez l’intention du réalisateur pour ce personnage : l’IA en tire ses propositions d’acteurs,
               et chaque carte retenue rejoint la shortlist du rôle.</p>
            <button type="button" class="btn-primary" (click)="openRole(null)">Nouveau rôle</button>
          </div>
        }

        <ol class="role-list">
          @for (r of roles(); track r.id; let i = $index, last = $last, first = $first) {
            <li class="role" [class.filled]="r.filled">
              <div class="order">
                <button type="button" [disabled]="first" (click)="move(i, -1)" [attr.aria-label]="'Monter ' + r.name">▲</button>
                <button type="button" [disabled]="last" (click)="move(i, 1)" [attr.aria-label]="'Descendre ' + r.name">▼</button>
              </div>
              <a class="role-main" [routerLink]="['/roles', r.id]">
                <div class="role-top">
                  <span class="tag">{{ importanceLabel(r.importance) }}</span>
                  @if (r.filled) { <span class="tag done">Pourvu</span> }
                </div>
                <h3>{{ r.name }}</h3>
                <p class="crit">{{ criteria(r) }}</p>
                <p class="counts">
                  @if (r.shortlistCount) {
                    {{ r.shortlistCount }} candidat{{ r.shortlistCount > 1 ? 's' : '' }}
                    @if (r.countByStatus.AUDITION) { · {{ r.countByStatus.AUDITION }} en audition }
                    @if (r.countByStatus.CHOISI) { · 1 choisi }
                  } @else { Shortlist vide }
                </p>
              </a>
              <div class="role-actions">
                <button type="button" class="btn-find" (click)="find(r)">Trouver des acteurs</button>
                <button type="button" class="icon" title="Modifier" aria-label="Modifier le rôle" (click)="openRole(r)">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                </button>
                <button type="button" class="icon danger" title="Supprimer" aria-label="Supprimer le rôle" (click)="remove(r)">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                </button>
              </div>
            </li>
          }
        </ol>
      </section>
    } @else if (notFound()) {
      <div class="empty"><h3>Projet introuvable</h3><p>Il a peut-être été supprimé, ou vous n'en faites pas partie.</p>
        <a routerLink="/projects" class="btn-ghost">Retour aux projets</a></div>
    } @else {
      <div class="skel"></div>
    }
  </div>

  @if (editOpen() && project()) {
    <app-project-form [project]="project()" (saved)="project.set($event); editOpen.set(false)" (cancel)="editOpen.set(false)" />
  }
  @if (roleFormOpen() && project()) {
    <app-role-form [projectId]="project()!.id" [role]="editingRole()" [projectStart]="project()!.startDate" [projectEnd]="project()!.endDate" (saved)="onRoleSaved($event)" (cancel)="roleFormOpen.set(false)" />
  }
  `,
  styles: [`
  :host { display: block; height: 100%; }
  .page { min-height: 100%; padding: 24px 32px 32px; display: flex; flex-direction: column; gap: 18px; }
  .back { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px 0 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--glass); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); color: var(--text-muted); text-decoration: none; font-size: 13.5px; font-weight: 500; transition: color .15s, border-color .15s, background .15s; svg { transition: transform .2s cubic-bezier(.2,.8,.2,1); } &:hover { color: var(--text-primary); border-color: var(--accent); } &:hover svg { transform: translateX(-3px); } }
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; padding: 22px;
    border-radius: var(--radius-l); border: 1px solid var(--border); background: var(--glass); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }
  .meta { display: flex; gap: 8px; margin-bottom: 10px; }
  .tag { font-size: 12.5px; padding: 2px 8px; border-radius: 4px; background: var(--bg-hover); color: var(--text-muted); }
  .tag.live { background: var(--accent-dim); color: var(--text-primary); }
  .tag.done { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  h1 { font-size: 38px; line-height: 1.05; }
  .dates { margin-top: 8px; color: var(--text-muted); font-size: 14px; }
  .desc { margin-top: 10px; max-width: 64ch; line-height: 1.6; }
  .head-side { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
  .progress { min-width: 220px; font-size: 13.5px; color: var(--text-muted); text-align: right; b { color: var(--text-primary); font-size: 18px; } }
  .bar { margin-top: 6px; height: 4px; border-radius: 4px; background: var(--bg-hover); overflow: hidden;
    span { display: block; height: 100%; background: var(--accent); transition: width .4s; } }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
  .btn-ghost, .btn-primary, .btn-find { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px; border-radius: var(--radius-s);
    font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; white-space: nowrap; }
  .btn-ghost { border: 1px solid var(--border); background: var(--glass); color: var(--text-primary); font-weight: 500; &:hover { background: var(--bg-hover); } }
  .btn-primary { border: none; background: var(--accent); color: var(--on-accent); &:hover { background: var(--accent-hover); } }
  .btn-find { border: 1px solid var(--accent); background: var(--accent-dim); color: var(--text-primary); &:hover { background: var(--accent); color: var(--on-accent); } }
  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); }
  .tabs button { position: relative; height: 42px; padding: 0 14px; border: none; background: none; color: var(--text-muted);
    font-size: 14.5px; font-weight: 500; cursor: pointer; transition: color .15s;
    &:hover { color: var(--text-primary); } &.on { color: var(--text-primary); font-weight: 600; }
    &.on::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 3px; border-radius: 3px 3px 0 0; background: var(--accent); }
    .n { margin-left: 4px; color: var(--text-subtle); } }
  .pane { animation: paneIn .25s ease both; }
  @keyframes paneIn { from { opacity: 0; transform: translateY(6px); } }
  .roles-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .roles h2 { font-size: 24px; }
  .role-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .role { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 14px; border-radius: var(--radius-m); border: 1px solid var(--border);
    background: var(--glass); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); transition: border-color .2s;
    &:hover { border-color: var(--accent); } &.filled { border-left: 3px solid var(--accent); } }
  .order { display: flex; flex-direction: column; gap: 2px;
    button { width: 26px; height: 22px; border: none; border-radius: 4px; background: transparent; color: var(--text-subtle); cursor: pointer; font-size: 10px;
      &:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); } &:disabled { opacity: .25; cursor: default; } } }
  .role-main { flex: 1 1 240px; min-width: 0; text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 3px; }
  .role-top { display: flex; gap: 6px; }
  .role-main h3 { font-size: 20px; font-stretch: var(--narrow); }
  .crit { font-size: 13.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .counts { font-size: 12.5px; color: var(--text-subtle); }
  .role-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  .icon { width: 34px; height: 34px; display: grid; place-items: center; border: none; border-radius: var(--radius-s); background: transparent;
    color: var(--text-muted); cursor: pointer; &:hover { background: var(--bg-hover); color: var(--text-primary); } &.danger:hover { color: var(--danger); } }
  .empty { padding: 44px 24px; text-align: center; border-radius: var(--radius-m); border: 1px dashed var(--border); background: var(--glass);
    h3 { font-size: 22px; font-stretch: var(--narrow); margin-bottom: 8px; } p { color: var(--text-muted); max-width: 56ch; margin: 0 auto 16px; line-height: 1.55; } }
  .skel { height: 180px; border-radius: var(--radius-l); background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-surface) 50%, var(--bg-hover) 75%);
    background-size: 200% 100%; animation: skel 1.4s linear infinite; }
  @keyframes skel { to { background-position: -200% 0; } }
  @container page (max-width: 760px) { .page { padding: 20px 16px; } h1 { font-size: 30px; } .role { flex-wrap: wrap; } .head-side { align-items: flex-start; } .progress { text-align: left; } }
  `]
})
export class ProjectDetailComponent implements OnInit {
  private readonly service = inject(ProjectService);
  private readonly casting = inject(CastingService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly project = signal<Project | null>(null);
  readonly roles = signal<CastingRole[]>([]);
  readonly rolesLoaded = signal(false);
  readonly notFound = signal(false);
  readonly editOpen = signal(false);
  readonly roleFormOpen = signal(false);
  readonly editingRole = signal<CastingRole | null>(null);
  readonly tabs = [{ id: 'roles', label: 'Rôles' }, { id: 'equipe', label: 'Équipe' }, { id: 'journal', label: 'Journal' }] as const;
  readonly tab = signal<'roles' | 'equipe' | 'journal'>('roles');
  typeLabel = typeLabel;
  importanceLabel = importanceLabel;
  criteria = criteria;

  filledCount = () => this.roles().filter(r => r.filled).length;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.service.get(id).subscribe({ next: p => this.project.set(p), error: () => this.notFound.set(true) });
    this.loadRoles(id);
  }

  loadRoles(projectId: string): void {
    this.casting.roles(projectId).subscribe({ next: r => { this.roles.set(r); this.rolesLoaded.set(true); }, error: () => this.rolesLoaded.set(true) });
  }

  openRole(r: CastingRole | null): void { this.editingRole.set(r); this.roleFormOpen.set(true); }

  onRoleSaved(r: CastingRole): void {
    this.roleFormOpen.set(false);
    const exists = this.roles().some(x => x.id === r.id);
    this.roles.update(list => exists ? list.map(x => x.id === r.id ? r : x) : [...list, r]);
  }

  move(i: number, delta: number): void {
    const list = [...this.roles()];
    const j = i + delta;
    [list[i], list[j]] = [list[j], list[i]];
    this.roles.set(list);                                    // affichage immédiat
    this.casting.reorder(this.project()!.id, list.map(r => r.id)).subscribe({ next: r => this.roles.set(r) });
  }

  remove(r: CastingRole): void {
    const extra = r.shortlistCount ? ` Sa shortlist (${r.shortlistCount} acteur${r.shortlistCount > 1 ? 's' : ''}) sera aussi supprimée.` : '';
    if (!confirm(`Supprimer le rôle « ${r.name} » ?${extra}`)) return;
    this.casting.deleteRole(r.id).subscribe(() => this.roles.update(list => list.filter(x => x.id !== r.id)));
  }

  /** Ouvre la recherche IA avec la phrase pré-remplie du rôle (US-06). */
  find(r: CastingRole): void { this.router.navigate(['/chat'], { queryParams: { role: r.id, n: Date.now() } }); }

  archive(): void { this.service.archive(this.project()!.id).subscribe(p => this.project.set(p)); }
  restore(): void { this.service.restore(this.project()!.id).subscribe(p => this.project.set(p)); }
  finish(): void { this.service.finish(this.project()!.id).subscribe(p => this.project.set(p)); }

  statusLabel(p: Project): string { return p.status === 'EN_COURS' ? 'En cours' : p.status === 'TERMINE' ? 'Terminé' : 'Archivé'; }

  dates(p: Project): string {
    const f = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    if (p.startDate && p.endDate) return `Du ${f(p.startDate)} au ${f(p.endDate)}`;
    if (p.startDate) return `À partir du ${f(p.startDate)}`;
    if (p.endDate) return `Jusqu'au ${f(p.endDate)}`;
    return 'Dates à définir';
  }
}
