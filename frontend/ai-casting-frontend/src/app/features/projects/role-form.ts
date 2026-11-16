import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CastingRole, CastingService, IMPORTANCES, Importance, RoleRequest } from '../../core/services/casting.service';

/** Formulaire de création / modification d'un rôle (US-05), affiché dans un panneau. */
@Component({
  selector: 'app-role-form',
  standalone: true,
  imports: [FormsModule],
  template: `
  <div class="backdrop" (click)="cancel.emit()"></div>
  <form class="panel" (ngSubmit)="submit()" role="dialog" aria-modal="true" (keydown.escape)="cancel.emit()"
        [attr.aria-label]="role ? 'Modifier le rôle' : 'Nouveau rôle'">
    <h2>{{ role ? 'Modifier le rôle' : 'Nouveau rôle' }}</h2>

    <label class="f"><span>Nom du rôle</span>
      <input name="name" [(ngModel)]="name" maxlength="120" placeholder="Léa, avocate bilingue" autofocus /></label>

    <div class="f"><span>Importance</span>
      <div class="chips" role="radiogroup" aria-label="Importance">
        @for (i of importances; track i.value) {
          <button type="button" role="radio" [attr.aria-checked]="importance === i.value" [class.on]="importance === i.value"
                  (click)="importance = i.value">{{ i.label }}</button>
        }
      </div></div>

    <div class="row">
      <div class="f"><span>Genre</span>
        <div class="chips" role="radiogroup" aria-label="Genre">
          @for (g of genders; track g.value) {
            <button type="button" role="radio" [attr.aria-checked]="gender === g.value" [class.on]="gender === g.value"
                    (click)="gender = g.value">{{ g.label }}</button>
          }
        </div></div>
      <div class="f age"><span>Âge</span>
        <div class="inline">
          <input type="number" name="min" [(ngModel)]="minAge" min="0" max="120" placeholder="min" aria-label="Âge minimum" />
          <em>à</em>
          <input type="number" name="max" [(ngModel)]="maxAge" min="0" max="120" placeholder="max" aria-label="Âge maximum" />
        </div></div>
    </div>

    <div class="f"><span>Langues</span>
      <div class="chips multi">
        @for (l of allLanguages; track l) {
          <button type="button" [attr.aria-pressed]="languages.has(l)" [class.on]="languages.has(l)" (click)="toggle(languages, l)">{{ l }}</button>
        }
      </div></div>

    <div class="f"><span>Compétences</span>
      <div class="chips multi">
        @for (s of allSkills; track s) {
          <button type="button" [attr.aria-pressed]="skills.has(s)" [class.on]="skills.has(s)" (click)="toggle(skills, s)">{{ s }}</button>
        }
      </div></div>

    <div class="row">
      <label class="f"><span>Ville</span><input name="city" [(ngModel)]="city" placeholder="Paris" /></label>
      <label class="f"><span>Tournage, début</span><input type="date" name="ss" [(ngModel)]="shootStart" /></label>
      <label class="f"><span>Fin</span><input type="date" name="se" [(ngModel)]="shootEnd" [min]="shootStart || null" /></label>
    </div>

    <label class="f"><span>Description <em>facultatif</em></span>
      <textarea name="desc" rows="3" [(ngModel)]="description" placeholder="Avocate pénaliste, rigoureuse, un humour pince-sans-rire."></textarea></label>

    @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

    <div class="actions">
      <button type="button" class="ghost" (click)="cancel.emit()">Annuler</button>
      <button type="submit" class="primary" [disabled]="saving()">{{ saving() ? 'Enregistrement…' : (role ? 'Enregistrer' : 'Créer le rôle') }}</button>
    </div>
  </form>
  `,
  styles: [`
  :host { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 20px; }
  .backdrop { position: absolute; inset: 0; background: rgba(10,10,12,.55); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); animation: fade .2s both; }
  .panel { position: relative; width: min(620px, 100%); max-height: calc(100vh - 40px); overflow: auto; display: flex; flex-direction: column; gap: 14px;
    padding: 24px; border-radius: var(--radius-l); border: 1px solid var(--border); background: var(--glass-strong);
    -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); box-shadow: 0 30px 80px rgba(0,0,0,.4); animation: pop .32s cubic-bezier(.2,.8,.2,1) both; }
  h2 { font-size: 26px; }
  .f { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
  .f > span { font-size: 13px; font-weight: 600; }
  .f em { font-style: normal; font-weight: 400; color: var(--text-subtle); }
  input, textarea { height: 40px; padding: 0 12px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--glass);
    color: var(--text-primary); font-size: 14.5px; outline: none; color-scheme: dark; min-width: 0; }
  :host-context(.light) input, :host-context(.light) textarea { color-scheme: light; }
  textarea { height: auto; padding: 10px 12px; resize: vertical; line-height: 1.5; }
  input:focus, textarea:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .row { display: flex; gap: 12px; }
  .inline { display: flex; align-items: center; gap: 8px; input { width: 70px; text-align: center; } em { color: var(--text-subtle); font-style: normal; } }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips button { height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--glass); color: var(--text-muted);
    font-size: 13.5px; cursor: pointer; transition: background .15s, color .15s; }
  .chips button:hover { color: var(--text-primary); }
  .chips button.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); font-weight: 600; }
  .err { color: var(--danger); font-size: 13.5px; }
  .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
  .actions button { height: 40px; padding: 0 16px; border-radius: var(--radius-s); font-size: 14px; font-weight: 600; cursor: pointer; }
  .ghost { border: 1px solid var(--border); background: transparent; color: var(--text-primary); }
  .primary { border: none; background: var(--accent); color: var(--on-accent); }
  .primary:hover { background: var(--accent-hover); }
  .primary:disabled { opacity: .6; cursor: default; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: translateY(16px) scale(.97); } }
  @media (max-width: 560px) { .row { flex-direction: column; } }
  `]
})
export class RoleFormComponent implements OnInit {
  @Input() projectId = '';
  @Input() role: CastingRole | null = null;
  @Output() saved = new EventEmitter<CastingRole>();
  @Output() cancel = new EventEmitter<void>();

  private readonly service = inject(CastingService);
  readonly importances = IMPORTANCES;
  readonly genders = [{ value: '', label: 'Indifférent' }, { value: 'Femme', label: 'Femme' }, { value: 'Homme', label: 'Homme' }];
  /** Langues et compétences reconnues par la recherche IA. */
  readonly allLanguages = ['Français', 'Anglais', 'Espagnol', 'Arabe', 'Italien', 'Allemand'];
  readonly allSkills = ['Danse', 'Chant', 'Comédie', 'Sport', 'Équitation', 'Escrime'];
  readonly saving = signal(false);
  readonly error = signal('');

  name = '';
  importance: Importance = 'SECONDAIRE';
  gender = '';
  minAge: number | null = null;
  maxAge: number | null = null;
  languages = new Set<string>();
  skills = new Set<string>();
  city = '';
  shootStart = '';
  shootEnd = '';
  description = '';

  ngOnInit(): void {
    const r = this.role;
    if (!r) return;
    this.name = r.name; this.importance = r.importance; this.gender = r.gender ?? '';
    this.minAge = r.minAge; this.maxAge = r.maxAge;
    this.languages = new Set(r.languages); this.skills = new Set(r.skills);
    this.city = r.city ?? ''; this.shootStart = r.shootStart ?? ''; this.shootEnd = r.shootEnd ?? '';
    this.description = r.description ?? '';
  }

  toggle(set: Set<string>, v: string): void { set.has(v) ? set.delete(v) : set.add(v); }

  submit(): void {
    if (!this.name.trim()) { this.error.set('Donnez un nom au rôle.'); return; }
    if (this.minAge != null && this.maxAge != null && this.minAge > this.maxAge) {
      this.error.set("L'âge minimum ne peut pas dépasser l'âge maximum."); return;
    }
    const req: RoleRequest = {
      name: this.name.trim(), importance: this.importance, gender: this.gender || null,
      minAge: this.minAge ?? null, maxAge: this.maxAge ?? null,
      languages: [...this.languages], skills: [...this.skills],
      city: this.city.trim() || null, shootStart: this.shootStart || null, shootEnd: this.shootEnd || null,
      description: this.description.trim() || null
    };
    this.saving.set(true); this.error.set('');
    const call = this.role ? this.service.updateRole(this.role.id, req) : this.service.createRole(this.projectId, req);
    call.subscribe({
      next: r => { this.saving.set(false); this.saved.emit(r); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.error.set(e.error?.message ?? 'Enregistrement impossible. Réessayez.'); }
    });
  }
}
