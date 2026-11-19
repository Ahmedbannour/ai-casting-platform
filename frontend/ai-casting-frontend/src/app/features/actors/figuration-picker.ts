import { Component, EventEmitter, Input, Output } from '@angular/core';

export type FigurationType = 'EXTRA' | 'SILHOUETTE' | 'FIGURANT_SPECIAL';

/**
 * Cahier v2 (EX-52) · L'acteur dit s'il accepte la figuration et pour quels types.
 * Valeur : null = pas encore répondu (ou « oui » sans type) ; [] = refuse ; sinon les types acceptés.
 */
@Component({
  selector: 'app-figuration-picker',
  standalone: true,
  template: `
  <fieldset class="fig" [class.error]="error">
    <legend>{{ question }}</legend>
    <div class="seg" role="radiogroup" [attr.aria-label]="question">
      <button type="button" role="radio" [attr.aria-checked]="accepts" [class.on]="accepts" (click)="setAccepts(true)">Oui</button>
      <button type="button" role="radio" [attr.aria-checked]="refuses" [class.on]="refuses" (click)="setAccepts(false)">Non</button>
    </div>
    @if (accepts) {
      <p class="hint">Quels types de figuration ?</p>
      <div class="types">
        @for (t of types; track t.value) {
          <label class="type" [class.on]="has(t.value)">
            <input type="checkbox" [checked]="has(t.value)" (change)="toggle(t.value)" />
            <span><b>{{ t.label }}</b><small>{{ t.hint }}</small></span>
          </label>
        }
      </div>
    }
    @if (error) { <small class="msg" role="alert">{{ error }}</small> }
  </fieldset>`,
  styles: [`
    .fig { border: 0; padding: 0; margin: 0 0 16px; min-width: 0; }
    legend { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--text-secondary, var(--text-muted)); }
    .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .seg button { height: 42px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--text-primary);
      font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: border-color .15s, background .15s; }
    .seg button.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
    .hint { margin: 12px 0 8px; font-size: 13px; color: var(--text-muted); }
    .types { display: grid; gap: 8px; }
    .type { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); cursor: pointer;
      transition: border-color .15s, background .15s; }
    .type.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
    .type input { margin-top: 3px; accent-color: var(--accent); }
    .type b { display: block; font-size: 14px; }
    .type small { display: block; margin-top: 2px; font-size: 12.5px; color: var(--text-muted); line-height: 1.4; }
    .error .seg button { border-color: var(--danger); }
    .msg { display: block; margin-top: 6px; color: var(--danger); font-size: 12.5px; }
  `]
})
export class FigurationPickerComponent {
  @Input() value: FigurationType[] | null = null;
  @Input() error = '';
  @Input() question = 'Acceptez-vous de travailler en figuration ?';
  @Output() valueChange = new EventEmitter<FigurationType[] | null>();

  readonly types: { value: FigurationType; label: string; hint: string }[] = [
    { value: 'EXTRA', label: 'Extra (figurant)', hint: 'De passage dans le décor, sans action particulière.' },
    { value: 'SILHOUETTE', label: 'Silhouette', hint: 'Remarqué à l’image, avec une action ou un geste précis.' },
    { value: 'FIGURANT_SPECIAL', label: 'Figurant spécial', hint: 'Une compétence ou une apparence particulière : métier, sport, véhicule…' }
  ];

  get accepts(): boolean { return !!this.value && this.value.length > 0 || this.open; }
  get refuses(): boolean { return !!this.value && this.value.length === 0 && !this.open; }
  /** « Oui » cliqué, aucun type encore coché. */
  private open = false;

  has(t: FigurationType): boolean { return !!this.value?.includes(t); }

  setAccepts(yes: boolean): void {
    this.open = yes && !(this.value?.length);
    this.emit(yes ? (this.value?.length ? this.value : null) : []);
  }

  toggle(t: FigurationType): void {
    const cur = this.value ?? [];
    const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t];
    this.open = next.length === 0;
    this.emit(next.length ? next : null);
  }

  /** null = réponse incomplète (rien choisi, ou « oui » sans type coché). */
  private emit(v: FigurationType[] | null): void { this.value = v; this.valueChange.emit(v); }
}

export const FIGURATION_MESSAGE = 'Répondez par oui ou non ; si oui, cochez au moins un type.';
