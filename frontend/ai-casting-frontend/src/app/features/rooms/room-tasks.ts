import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { RoomMember, RoomService, RoomTask, TaskStatus } from '../../core/services/room.service';
import { SelectFieldComponent, SelectOption } from '../../shared/components/select-field/select-field';
import { DateFieldComponent } from '../../shared/components/date-field/date-field';

/** Tâches de la room : ajout en une ligne (quoi, qui, quand), trois colonnes, glisser-déposer entre colonnes. */
@Component({
  selector: 'app-room-tasks',
  standalone: true,
  imports: [DatePipe, FormsModule, CdkDropListGroup, CdkDropList, CdkDrag, SelectFieldComponent, DateFieldComponent],
  template: `
  @if (canEdit()) {
    <form class="quick" (ngSubmit)="add()">
      <input name="title" [(ngModel)]="title" maxlength="200" placeholder="Nouvelle tâche, ex. Valider les essais costumes" aria-label="Titre de la tâche" />
      <app-select name="who" [options]="people()" [(ngModel)]="assignee" placeholder="Pour qui ?" ariaLabel="Confier à" />
      <app-date-field name="due" [(ngModel)]="due" [min]="today" placeholder="Pour quand ?" ariaLabel="Échéance" />
      <button type="submit" class="primary" [disabled]="busy() || !title.trim()">Ajouter</button>
    </form>
  }
  <div class="board" cdkDropListGroup>
    @for (col of columns; track col.status) {
      <section class="col" [attr.data-s]="col.status">
        <header><span class="dot" aria-hidden="true"></span>{{ col.label }} <span class="n">{{ byStatus()[col.status].length }}</span></header>
        <div class="drop" cdkDropList [id]="col.status" [cdkDropListData]="byStatus()[col.status]" (cdkDropListDropped)="drop($event, col.status)">
          @for (t of byStatus()[col.status]; track t.id) {
            <article class="task" cdkDrag [cdkDragData]="t" [cdkDragDisabled]="!t.canMove" [class.mine]="t.assigneeId === myId()"
                     [class.late]="late(t)" [class.locked]="!t.canMove">
              <b>{{ t.title }}</b>
              <div class="meta">
                @if (t.assigneeName) { <span class="who"><i>{{ initials(t.assigneeName) }}</i>{{ t.assigneeId === myId() ? 'Vous' : t.assigneeName }}</span> }
                @if (t.dueDate) { <span class="due">{{ late(t) ? 'En retard · ' : '' }}{{ t.dueDate | date:'d MMM' }}</span> }
                @if (t.canEdit) { <button type="button" class="x" (click)="remove(t)" aria-label="Supprimer la tâche">✕</button> }
              </div>
            </article>
          } @empty { <p class="none">{{ col.empty }}</p> }
        </div>
      </section>
    }
  </div>
  @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
  `,
  styles: [`
  :host { display: flex; flex-direction: column; gap: 14px; }
  .quick { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto; gap: 8px; align-items: start; }
  .quick input { height: 42px; padding: 0 12px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--glass); color: var(--text-primary); font: inherit; font-size: 14.5px; min-width: 0; }
  .quick input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .primary { height: 42px; padding: 0 18px; border-radius: 12px; border: 0; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 700; cursor: pointer; }
  .primary:disabled { opacity: .5; cursor: default; }
  .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
  .col { border-radius: 16px; border: 1px solid var(--border); background: var(--glass); padding: 10px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .col header { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; padding: 2px 4px; }
  .col .n { margin-left: auto; font-size: 12px; color: var(--text-muted); }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--text-subtle); }
  .col[data-s="EN_COURS"] .dot { background: var(--accent); } .col[data-s="FAIT"] .dot { background: var(--success); }
  .drop { min-height: 70px; display: flex; flex-direction: column; gap: 8px; border-radius: 12px; transition: background .15s; }
  .drop.cdk-drop-list-receiving { background: var(--accent-dim); outline: 2px dashed var(--accent); outline-offset: -2px; }
  .task { padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-secondary); cursor: grab; display: flex; flex-direction: column; gap: 6px;
    animation: tIn .25s ease both; touch-action: none; }
  @keyframes tIn { from { opacity: 0; transform: scale(.97); } }
  .task.locked { cursor: default; touch-action: auto; }
  .task.mine { border-left: 3px solid var(--accent); }
  .task b { font-size: 14px; font-weight: 600; line-height: 1.35; }
  .col[data-s="FAIT"] .task b { text-decoration: line-through; color: var(--text-muted); }
  .meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--text-muted); }
  .who { display: inline-flex; align-items: center; gap: 5px; }
  .who i { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 9.5px; font-weight: 800; background: var(--accent-dim); color: var(--accent-ink); }
  .task.late .due { color: var(--danger); font-weight: 700; }
  .x { margin-left: auto; width: 24px; height: 24px; border: 0; border-radius: 6px; background: transparent; color: var(--text-subtle); cursor: pointer; }
  .x:hover { color: var(--danger); background: var(--bg-hover); }
  .none { margin: 0; padding: 14px 6px; font-size: 12.5px; color: var(--text-subtle); text-align: center; }
  .task.cdk-drag-preview { box-shadow: 0 18px 40px color-mix(in srgb, var(--graphite-950) 35%, transparent), 0 0 0 2px var(--accent); rotate: -1.5deg; }
  .task.cdk-drag-placeholder { opacity: .35; border-style: dashed; }
  .drop.cdk-drop-list-dragging .task:not(.cdk-drag-placeholder) { transition: transform .22s cubic-bezier(.2,.8,.2,1); }
  .err { color: var(--danger); font-size: 13.5px; margin: 0; }
  @media (max-width: 820px) { .board { grid-template-columns: 1fr; } .quick { grid-template-columns: 1fr 1fr; } .quick input { grid-column: 1 / -1; } .primary { grid-column: 1 / -1; } }
  `]
})
export class RoomTasksComponent {
  private readonly api = inject(RoomService);
  readonly roomId = input.required<string>();
  readonly members = input<RoomMember[]>([]);
  readonly canEdit = input(false);
  readonly myId = input<string>('');
  readonly changed = signal(0);

  readonly columns: { status: TaskStatus; label: string; empty: string }[] = [
    { status: 'A_FAIRE', label: 'À faire', empty: 'Rien à faire pour l’instant' },
    { status: 'EN_COURS', label: 'En cours', empty: 'Glissez une tâche ici quand vous la commencez' },
    { status: 'FAIT', label: 'Fait', empty: 'Les tâches terminées arrivent ici' }
  ];
  readonly list = signal<RoomTask[]>([]);
  readonly byStatus = computed(() => {
    const out: Record<TaskStatus, RoomTask[]> = { A_FAIRE: [], EN_COURS: [], FAIT: [] };
    for (const t of this.list()) out[t.status].push(t);
    return out;
  });
  readonly people = computed<SelectOption[]>(() => [{ value: '', label: 'Personne' }, ...this.members().map(m => ({ value: m.userId, label: m.name + (m.organisation ? ' · ' + m.organisation : '') }))]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly today = new Date().toISOString().slice(0, 10);
  title = ''; assignee: string = ''; due = '';

  constructor() { effect(() => { const id = this.roomId(); this.api.tasks(id).subscribe({ next: t => this.list.set(t) }); }); }

  add(): void {
    if (!this.title.trim()) return;
    this.busy.set(true); this.error.set('');
    this.api.addTask(this.roomId(), { title: this.title.trim(), assigneeId: this.assignee || null, dueDate: this.due || null }).subscribe({
      next: t => { this.list.set(t); this.busy.set(false); this.title = ''; this.assignee = ''; this.due = ''; },
      error: e => { this.busy.set(false); this.error.set(e.error?.message ?? 'Ajout impossible.'); }
    });
  }

  drop(e: CdkDragDrop<RoomTask[]>, status: TaskStatus): void {
    const t = e.item.data as RoomTask;
    if (e.previousContainer === e.container && e.previousIndex === e.currentIndex) return;
    // Affichage immédiat, puis enregistrement.
    this.list.update(l => {
      const rest = l.filter(x => x.id !== t.id);
      const col = rest.filter(x => x.status === status);
      const moved = { ...t, status };
      col.splice(e.currentIndex, 0, moved);
      return [...rest.filter(x => x.status !== status), ...col];
    });
    navigator.vibrate?.(10);
    this.api.moveTask(this.roomId(), t.id, status, e.currentIndex).subscribe({
      next: l => this.list.set(l),
      error: err => { this.error.set(err.error?.message ?? 'Déplacement impossible.'); this.api.tasks(this.roomId()).subscribe(l => this.list.set(l)); }
    });
  }

  remove(t: RoomTask): void { this.api.deleteTask(this.roomId(), t.id).subscribe({ next: l => this.list.set(l) }); }
  late(t: RoomTask): boolean { return !!t.dueDate && t.status !== 'FAIT' && t.dueDate < this.today; }
  initials(n: string): string { return n.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
}
