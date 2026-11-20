import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { DateFieldComponent } from '../../shared/components/date-field/date-field';
import { frDate } from '../../shared/forms/dates';
import { HttpErrorResponse } from '@angular/common/http';
import { CastingRole, CastingService, IMPORTANCES, Importance, RoleRequest } from '../../core/services/casting.service';

/** Formulaire de création / modification d'un rôle (US-05), affiché dans un panneau. */
@Component({
  selector: 'app-role-form',
  standalone: true,
  imports: [FormsModule, DateFieldComponent],
  template: `
  <div class="backdrop" (click)="cancel.emit()"></div>
  <form class="panel" #f="ngForm" novalidate (ngSubmit)="submit(f)" role="dialog" aria-modal="true" (keydown.escape)="cancel.emit()"
        [attr.aria-label]="role ? 'Modifier le rôle' : 'Nouveau rôle'">
    <h2>{{ role ? 'Modifier le rôle' : 'Nouveau rôle' }}</h2>

    <div class="f"><label for="r-name">Nom du rôle</label>
      <input id="r-name" name="name" [(ngModel)]="name" #n="ngModel" required maxlength="120" placeholder="Léa, avocate bilingue" autofocus
             [attr.aria-invalid]="(n.touched || tried()) && !name.trim()" />
      @if ((n.touched || tried()) && !name.trim()) { <small class="field-msg" role="alert">Donnez un nom au rôle.</small> }
    </div>

    <div class="f"><span>Importance</span>
      <div class="chips" role="radiogroup" aria-label="Importance">
        @for (i of importances; track i.value) {
          <button type="button" role="radio" [attr.aria-checked]="importance === i.value" [class.on]="importance === i.value"
                  (click)="importance = i.value">{{ i.label }}</button>
        }
      </div></div>
    @if (importance === 'FIGURATION') {
      <div class="f"><span>Type de figuration</span>
        <div class="chips" role="radiogroup" aria-label="Type de figuration">
          @for (t of figurationTypes; track t.value) {
            <button type="button" role="radio" [attr.aria-checked]="figurationType === t.value" [class.on]="figurationType === t.value"
                    (click)="figurationType = t.value">{{ t.label }}</button>
          }
        </div>
        <small class="hint-fig">Seuls les acteurs qui ont accepté ce type de figuration seront proposés.</small>
      </div>
    }

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
          <input type="number" name="min" [(ngModel)]="minAge" min="0" max="120" step="1" inputmode="numeric" placeholder="min" aria-label="Âge minimum"
                 [attr.aria-invalid]="!!ageError() && ageError() !== 'max'" />
          <em>à</em>
          <input type="number" name="max" [(ngModel)]="maxAge" min="0" max="120" step="1" inputmode="numeric" placeholder="max" aria-label="Âge maximum"
                 [attr.aria-invalid]="!!ageError() && ageError() !== 'min'" />
          <em>ans</em>
        </div>
        @if (ageMessage(); as m) { <small class="field-msg" role="alert">{{ m }}</small> }
      </div>
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

    <div class="f"><label for="r-city">Ville de tournage</label><input id="r-city" name="city" [(ngModel)]="city" maxlength="80" placeholder="Paris" /></div>

    <div class="row">
      <div class="f"><label for="r-ss">Tournage, début</label>
        <app-date-field name="ss" inputId="r-ss" [(ngModel)]="shootStart"
                        [min]="projectStart || null" [max]="shootEnd || projectEnd || null"
                        [rangeStart]="shootStart" [rangeEnd]="shootEnd" [openAt]="projectStart"
                        [minMessage]="'Le projet commence le ' + frDate(projectStart) + '.'"
                        [maxMessage]="shootEnd ? 'Le début doit précéder la fin du tournage.' : 'Le projet se termine le ' + frDate(projectEnd) + '.'" /></div>
      <div class="f"><label for="r-se">Fin</label>
        <app-date-field name="se" inputId="r-se" [(ngModel)]="shootEnd"
                        [min]="shootStart || projectStart || null" [max]="projectEnd || null"
                        [rangeStart]="shootStart" [rangeEnd]="shootEnd" [openAt]="shootStart || projectStart"
                        [minMessage]="shootStart ? 'La fin ne peut pas précéder le début.' : 'Le projet commence le ' + frDate(projectStart) + '.'"
                        [maxMessage]="'Le projet se termine le ' + frDate(projectEnd) + '.'" /></div>
    </div>
    @if (projectStart || projectEnd) {
      <p class="field-hint period">Période du projet : {{ projectStart ? 'du ' + frDate(projectStart) : '' }} {{ projectEnd ? 'au ' + frDate(projectEnd) : '' }}</p>
    }

    <label class="f intention"><span>Intention du réalisateur <em>conseillé</em></span>
      <textarea name="intention" rows="4" maxlength="4000" [(ngModel)]="intention"
        placeholder="Qui est le personnage, ce qu’il doit dégager, le ton et le jeu attendus. Ex. : une avocate de 30 ans, rigoureuse, un humour pince-sans-rire qui désamorce les scènes tendues."></textarea>
      <small class="field-hint">L’IA part de cette intention pour proposer les acteurs, et dit pour chacun ce qui y répond.</small></label>

    <label class="f"><span>Description <em>facultatif</em></span>
      <textarea name="desc" rows="3" maxlength="2000" [(ngModel)]="description" placeholder="Avocate pénaliste, rigoureuse, un humour pince-sans-rire."></textarea></label>

    @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

    <div class="actions">
      <button type="button" class="ghost" (click)="cancel.emit()">Annuler</button>
      <button type="submit" class="primary" [disabled]="saving()">{{ saving() ? 'Enregistrement…' : (role ? 'Enregistrer' : 'Créer le rôle') }}</button>
    </div>
  </form>
  `,
  styles: [`
    .hint-fig { display: block; margin-top: 6px; color: var(--text-muted); font-size: 12.5px; }
  :host { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 20px; }
  .backdrop { position: absolute; inset: 0; background: rgba(10,10,12,.55); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); animation: fade .2s both; }
  .panel { position: relative; width: min(620px, 100%); max-height: calc(100vh - 40px); overflow: auto; display: flex; flex-direction: column; gap: 14px;
    padding: 24px; border-radius: var(--radius-l); border: 1px solid var(--border); background: var(--glass-strong);
    -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); box-shadow: 0 30px 80px rgba(0,0,0,.4); animation: pop .32s cubic-bezier(.2,.8,.2,1) both; }
  h2 { font-size: 26px; }
  .f { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
  .f > span, .f > label { font-size: 13px; font-weight: 600; }
  .period { margin-top: -6px; }
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
  @container page (max-width: 560px) { .row { flex-direction: column; } }
  `]
})
export class RoleFormComponent implements OnInit {
  @Input() projectId = '';
  @Input() role: CastingRole | null = null;
  /** Période du projet : le tournage d'un rôle doit y tenir. */
  @Input() projectStart: string | null = null;
  @Input() projectEnd: string | null = null;
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
  readonly tried = signal(false);
  readonly frDate = frDate;

  name = '';
  importance: Importance = 'SECONDAIRE';
  /** T-165 · null = tout figurant. */
  figurationType: string | null = null;
  readonly figurationTypes = [
    { value: null, label: 'Tout figurant' }, { value: 'EXTRA', label: 'Extra' },
    { value: 'SILHOUETTE', label: 'Silhouette' }, { value: 'FIGURANT_SPECIAL', label: 'Figurant spécial' }
  ];
  gender = '';
  minAge: number | null = null;
  maxAge: number | null = null;
  languages = new Set<string>();
  skills = new Set<string>();
  city = '';
  shootStart = '';
  shootEnd = '';
  description = '';
  intention = '';

  ngOnInit(): void {
    const r = this.role;
    if (!r) return;
    this.name = r.name; this.importance = r.importance; this.figurationType = r.figurationType ?? null; this.gender = r.gender ?? '';
    this.minAge = r.minAge; this.maxAge = r.maxAge;
    this.languages = new Set(r.languages); this.skills = new Set(r.skills);
    this.city = r.city ?? ''; this.shootStart = r.shootStart ?? ''; this.shootEnd = r.shootEnd ?? '';
    this.description = r.description ?? '';
    this.intention = r.intention ?? '';
  }

  private num(v: number | null): number | null { return v === null || v === undefined || (v as any) === '' ? null : +v; }

  toggle(set: Set<string>, v: string): void { set.has(v) ? set.delete(v) : set.add(v); }

  /** 'min' / 'max' : borne seule invalide ; 'order' : min > max. */
  ageError(): 'min' | 'max' | 'order' | null {
    const bad = (v: number | null) => v != null && (String(v) === '' ? false : !Number.isInteger(+v) || +v < 0 || +v > 120);
    if (bad(this.minAge)) return 'min';
    if (bad(this.maxAge)) return 'max';
    if (this.minAge != null && this.maxAge != null && (this.minAge as any) !== '' && (this.maxAge as any) !== '' && +this.minAge > +this.maxAge) return 'order';
    return null;
  }
  ageMessage(): string {
    switch (this.ageError()) {
      case 'min': return "Âge minimum : un nombre entier entre 0 et 120.";
      case 'max': return "Âge maximum : un nombre entier entre 0 et 120.";
      case 'order': return "L'âge minimum dépasse l'âge maximum.";
      default: return '';
    }
  }

  submit(f: NgForm): void {
    this.tried.set(true);
    f.control.markAllAsTouched();
    if (!this.name.trim()) { this.error.set('Donnez un nom au rôle.'); return; }
    if (this.ageError() || f.invalid) { this.error.set('Corrigez les champs signalés en rouge.'); return; }
    const req: RoleRequest = {
      name: this.name.trim(), importance: this.importance, gender: this.gender || null,
      figurationType: this.importance === 'FIGURATION' ? this.figurationType : null,
      minAge: this.num(this.minAge), maxAge: this.num(this.maxAge),
      languages: [...this.languages], skills: [...this.skills],
      city: this.city.trim() || null, shootStart: this.shootStart || null, shootEnd: this.shootEnd || null,
      description: this.description.trim() || null,
      intention: this.intention.trim() || null
    };
    this.saving.set(true); this.error.set('');
    const call = this.role ? this.service.updateRole(this.role.id, req) : this.service.createRole(this.projectId, req);
    call.subscribe({
      next: r => { this.saving.set(false); this.saved.emit(r); },
      error: (e: HttpErrorResponse) => { this.saving.set(false); this.error.set(e.error?.message ?? 'Enregistrement impossible. Réessayez.'); }
    });
  }
}
