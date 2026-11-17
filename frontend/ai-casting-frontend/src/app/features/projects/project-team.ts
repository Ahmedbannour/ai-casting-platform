import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CastingService, Member } from '../../core/services/casting.service';

/** Équipe du projet (US-04) : membres et invitation par e-mail. */
@Component({
  selector: 'app-project-team',
  standalone: true,
  imports: [FormsModule],
  template: `
  <div class="team">
    @if (canManage) {
      <form class="invite" (ngSubmit)="invite()">
        <label class="sr-only" for="invite-email">Adresse e-mail du collègue</label>
        <input id="invite-email" name="email" type="email" [(ngModel)]="email" placeholder="collegue@agence.fr" autocomplete="off" />
        <button type="submit" class="btn" [disabled]="busy()">{{ busy() ? 'Invitation…' : 'Inviter' }}</button>
      </form>
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
      @if (done()) { <p class="ok" role="status">{{ done() }}</p> }
    }
    <ul class="members">
      @for (m of members(); track m.userId) {
        <li class="member">
          <span class="av" [style.background]="color(m.name || m.email)">{{ initials(m.name || m.email) }}</span>
          <span class="who"><b>{{ m.name || m.email }}</b><small>{{ m.email }}</small></span>
          @if (m.owner) { <span class="tag">Propriétaire</span> }
          @else if (canManage) {
            <button type="button" class="remove" (click)="remove(m)" [attr.aria-label]="'Retirer ' + (m.name || m.email)">Retirer</button>
          }
        </li>
      }
    </ul>
    @if (members().length === 1) {
      <p class="hint">Invitez les personnes qui préparent ce casting avec vous : elles verront le projet, ses rôles et ses shortlists.</p>
    }
  </div>
  `,
  styles: [`
  .team { display: flex; flex-direction: column; gap: 12px; }
  .invite { display: flex; gap: 8px; max-width: 520px; }
  input { flex: 1; height: 40px; padding: 0 12px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--glass);
    color: var(--text-primary); font-size: 14px; outline: none; }
  input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .btn { height: 40px; padding: 0 16px; border: none; border-radius: var(--radius-s); background: var(--accent); color: var(--on-accent); font-weight: 700; cursor: pointer; }
  .btn:disabled { opacity: .6; }
  .err { color: var(--danger); font-size: 13.5px; } .ok { color: var(--text-muted); font-size: 13.5px; }
  .members { list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .member { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: var(--radius-m); border: 1px solid var(--border); background: var(--glass); }
  .av { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: 12.5px; font-weight: 700; flex: none; }
  .who { display: flex; flex-direction: column; min-width: 0; b { font-size: 14.5px; } small { color: var(--text-muted); font-size: 12.5px; } }
  .tag { margin-left: auto; font-size: 12px; padding: 2px 8px; border-radius: 4px; background: var(--accent-dim); color: var(--text-primary); }
  .remove { margin-left: auto; border: none; background: none; color: var(--text-subtle); cursor: pointer; font-size: 13px; &:hover { color: var(--danger); } }
  .hint { color: var(--text-muted); font-size: 13.5px; max-width: 60ch; }
  `]
})
export class ProjectTeamComponent implements OnInit {
  @Input({ required: true }) projectId = '';
  @Input() canManage = false;

  private readonly casting = inject(CastingService);
  readonly members = signal<Member[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly done = signal('');
  email = '';

  ngOnInit(): void { this.load(); }

  load(): void { this.casting.members(this.projectId).subscribe(m => this.members.set(m)); }

  invite(): void {
    const email = this.email.trim();
    this.error.set(''); this.done.set('');
    if (!email) { this.error.set('Saisissez l’adresse e-mail du collègue.'); return; }
    this.busy.set(true);
    this.casting.addMember(this.projectId, email).subscribe({
      next: m => { this.busy.set(false); this.email = ''; this.members.update(l => [...l, m]); this.done.set(`${m.name || m.email} fait maintenant partie de l’équipe.`); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Invitation impossible. Réessayez.'); }
    });
  }

  remove(m: Member): void {
    if (!confirm(`Retirer ${m.name || m.email} de l’équipe ?`)) return;
    this.casting.removeMember(this.projectId, m.userId).subscribe(() => this.members.update(l => l.filter(x => x.userId !== m.userId)));
  }

  initials(s: string): string { return s.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''); }
  color(s: string): string { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 38% 42%)`; }
}
