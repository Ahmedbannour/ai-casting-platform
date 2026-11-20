import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { DateFieldComponent } from '../../shared/components/date-field/date-field';
import { HttpErrorResponse } from '@angular/common/http';
import { PROJECT_TYPES, Project, ProjectRequest, ProjectService, ProjectType } from '../../core/services/project.service';

/** Formulaire de création / modification d'un projet, affiché dans un panneau. */
@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [FormsModule, DateFieldComponent],
  template: `
  <div class="backdrop" (click)="cancel.emit()"></div>
  <form class="panel" #f="ngForm" novalidate (ngSubmit)="submit(f)" role="dialog" aria-modal="true"
        [attr.aria-label]="project ? 'Modifier le projet' : 'Nouveau projet'" (keydown.escape)="cancel.emit()">
    <h2>{{ project ? 'Modifier le projet' : 'Nouveau projet' }}</h2>

    <div class="f">
      <label for="p-title">Titre</label>
      <input id="p-title" name="title" [(ngModel)]="title" #t="ngModel" required maxlength="160" placeholder="Les Passagers" autofocus
             [attr.aria-invalid]="t.touched && !title.trim()" />
      @if (t.touched && !title.trim()) { <small class="field-msg" role="alert">Donnez un titre au projet.</small> }
      @else if (title.length > 140) { <small class="field-hint">{{ 160 - title.length }} caractères restants</small> }
    </div>

    <div class="f">
      <span>Type</span>
      <div class="types" role="radiogroup" aria-label="Type de projet">
        @for (t of types; track t.value) {
          <button type="button" role="radio" [attr.aria-checked]="type === t.value" [class.on]="type === t.value"
                  (click)="type = t.value">{{ t.label }}</button>
        }
      </div>
    </div>

    <div class="row">
      <div class="f">
        <label for="p-start">Début</label>
        <app-date-field name="start" inputId="p-start" [(ngModel)]="startDate"
                        [max]="endDate || null" [rangeStart]="startDate" [rangeEnd]="endDate"
                        maxMessage="Le début doit précéder la fin du projet." />
      </div>
      <div class="f">
        <label for="p-end">Fin</label>
        <app-date-field name="end" inputId="p-end" [(ngModel)]="endDate"
                        [min]="startDate || null" [rangeStart]="startDate" [rangeEnd]="endDate" [openAt]="startDate"
                        minMessage="La fin ne peut pas précéder le début." />
      </div>
    </div>

    @if (duration(); as d) { <p class="field-hint dur">Durée : {{ d }}</p> }

    <div class="f">
      <label for="p-desc">Description <em>facultatif</em></label>
      <textarea id="p-desc" name="desc" rows="3" maxlength="2000" [(ngModel)]="description" placeholder="Drame, tournage à Marseille au printemps."></textarea>
    </div>

    @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

    <div class="actions">
      <button type="button" class="ghost" (click)="cancel.emit()">Annuler</button>
      <button type="submit" class="primary" [disabled]="saving()">
        {{ saving() ? 'Enregistrement…' : (project ? 'Enregistrer' : 'Créer le projet') }}
      </button>
    </div>
  </form>
  `,
  styles: [`
  :host { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 20px; }
  @media (max-width: 600px) { :host { padding: 12px; } }
  .backdrop { position: absolute; inset: 0; background: rgba(10, 10, 12, .55); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); animation: fade .2s both; }
  .panel { position: relative; width: min(520px, 100%); max-height: calc(100vh - 40px); max-height: calc(100dvh - 24px); overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
    display: flex; flex-direction: column; gap: 16px; padding: 24px; border-radius: var(--radius-l);
    border: 1px solid var(--border); background: var(--glass-strong); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur);
    box-shadow: 0 30px 80px rgba(0,0,0,.4); animation: pop .32s cubic-bezier(.2,.8,.2,1) both; }
  h2 { font-size: 26px; }
  .f { display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .f > span, .f > label { font-size: 13px; font-weight: 600; color: var(--text-primary); }
  .dur { margin-top: -8px; }
  .f em { font-style: normal; font-weight: 400; color: var(--text-subtle); }
  input, textarea { height: 42px; padding: 0 12px; border-radius: var(--radius-s); border: 1px solid var(--border);
    background: var(--glass); color: var(--text-primary); font-size: 14.5px; outline: none; color-scheme: dark; }
  :host-context(.light) input, :host-context(.light) textarea { color-scheme: light; }
  textarea { height: auto; min-height: 96px; padding: 10px 12px; resize: vertical; line-height: 1.5; }
  input:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .row { display: flex; gap: 12px; }
  .types { display: flex; flex-wrap: wrap; gap: 6px; }
  .types button { height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--glass);
    color: var(--text-muted); font-size: 13.5px; cursor: pointer; transition: background .15s, color .15s; }
  .types button:hover { color: var(--text-primary); }
  .types button.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
  .err { color: var(--danger); font-size: 13.5px; }
  .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
  .actions button { height: 40px; padding: 0 16px; border-radius: var(--radius-s); font-size: 14px; font-weight: 600; cursor: pointer; }
  .ghost { border: 1px solid var(--border); background: transparent; color: var(--text-primary); }
  .primary { border: none; background: var(--accent); color: var(--on-accent); }
  .primary:hover { background: var(--accent-hover); }
  .primary:disabled { opacity: .6; cursor: default; }
  /* Une popup trop haute pour l'écran défile : ses champs gardent leur taille au lieu d'être écrasés. */
  .panel > * { flex-shrink: 0; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: translateY(16px) scale(.97); } }
  @container page (max-width: 520px) { .row { flex-direction: column; } }
  `]
})
export class ProjectFormComponent implements OnInit {
  @Input() project: Project | null = null;
  @Output() saved = new EventEmitter<Project>();
  @Output() cancel = new EventEmitter<void>();

  private readonly service = inject(ProjectService);
  readonly types = PROJECT_TYPES;
  readonly saving = signal(false);
  readonly error = signal('');

  title = '';
  type: ProjectType = 'LONG_METRAGE';
  startDate = '';
  endDate = '';
  description = '';

  ngOnInit(): void {
    if (this.project) {
      this.title = this.project.title;
      this.type = this.project.type;
      this.startDate = this.project.startDate ?? '';
      this.endDate = this.project.endDate ?? '';
      this.description = this.project.description ?? '';
    }
  }

  /** Durée lisible quand les deux dates sont posées et cohérentes. */
  duration(): string {
    if (!this.startDate || !this.endDate || this.endDate < this.startDate) return '';
    const days = Math.round((Date.parse(this.endDate) - Date.parse(this.startDate)) / 86400000) + 1;
    if (days < 14) return `${days} jour${days > 1 ? 's' : ''}`;
    if (days < 70) return `${Math.round(days / 7)} semaines`;
    return `${Math.round(days / 30.44)} mois`;
  }

  submit(f: NgForm): void {
    f.control.markAllAsTouched();
    if (!this.title.trim()) { this.error.set('Donnez un titre au projet.'); return; }
    if (f.invalid || (this.startDate && this.endDate && this.endDate < this.startDate)) {
      this.error.set('Corrigez les champs signalés en rouge.'); return;
    }
    const req: ProjectRequest = {
      title: this.title.trim(), type: this.type, description: this.description.trim() || null,
      startDate: this.startDate || null, endDate: this.endDate || null
    };
    this.saving.set(true);
    this.error.set('');
    const call = this.project ? this.service.update(this.project.id, req) : this.service.create(req);
    call.subscribe({
      next: p => { this.saving.set(false); this.saved.emit(p); },
      error: (e: HttpErrorResponse) => {
        this.saving.set(false);
        this.error.set(e.error?.message ?? 'Enregistrement impossible. Réessayez.');
      }
    });
  }
}
