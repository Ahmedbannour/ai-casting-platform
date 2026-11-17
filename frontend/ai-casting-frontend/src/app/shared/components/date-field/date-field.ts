import { Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, effect, forwardRef, input, signal } from '@angular/core';
import { AbstractControl, ControlValueAccessor, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors, Validator } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { SelectFieldComponent } from '../select-field/select-field';
import { usableBottom } from '../../forms/viewport';
import { DAYS_FR, MONTHS_FR, addDays, addMonths, clampIso, frDate, fromIso, parseFr, toIso, todayIso } from '../../forms/dates';

interface Cell { iso: string; d: number; inMonth: boolean; today: boolean; disabled: boolean; inRange: boolean; edge: boolean; label: string; }

/**
 * Champ date : saisie « jj/mm/aaaa » au clavier ou calendrier en français.
 * Valeur échangée : « AAAA-MM-JJ » ou chaîne vide. Fonctionne avec ngModel et formControlName.
 * Erreurs exposées au formulaire : dateFormat, dateMin, dateMax.
 */
@Component({
  selector: 'app-date-field',
  standalone: true,
  imports: [FormsModule, SelectFieldComponent],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateFieldComponent), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DateFieldComponent), multi: true }
  ],
  template: `
  <div class="df" [class.compact]="compact()" [class.open]="open()" [class.invalid]="showError()" [class.disabled]="disabled()" (click)="focusInput($event)">
    <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>
    <input #inp class="df-input" type="text" inputmode="numeric" autocomplete="off" maxlength="10" spellcheck="false"
           [id]="inputId()" [placeholder]="placeholder()" [value]="text()" [disabled]="disabled()"
           [attr.aria-label]="ariaLabel() || null" [attr.aria-invalid]="showError()" [attr.aria-describedby]="showError() ? inputId() + '-msg' : null"
           aria-haspopup="dialog" [attr.aria-expanded]="open()"
           (input)="onType($event)" (blur)="onBlur()" (keydown)="onInputKey($event)" />
    @if (value() && !disabled() && clearable()) {
      <button type="button" class="x" (click)="clear(); $event.stopPropagation()" aria-label="Effacer la date">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>
      </button>
    }
    <button type="button" class="cal-btn" (click)="toggle(); $event.stopPropagation()" [disabled]="disabled()"
            [attr.aria-label]="open() ? 'Fermer le calendrier' : 'Ouvrir le calendrier'">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
    </button>
  </div>
  @if (showError() && showMessage()) { <small class="df-msg" [id]="inputId() + '-msg'" role="alert">{{ message() }}</small> }

  @if (open()) {
    <div #cal class="df-cal" role="dialog" aria-label="Choisir une date" [class.up]="placeUp()"
         [style.top.px]="pos().top" [style.left.px]="pos().left" (keydown)="onCalKey($event)">
      <div class="head">
        <button type="button" class="nav" (click)="shiftMonth(-1)" [attr.aria-disabled]="!canPrev()" aria-label="Mois précédent">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
        <div class="title">
          <app-select class="month" [options]="monthOptions" [ngModel]="viewMonth()" (ngModelChange)="setView(viewYear(), $event)"
                      ariaLabel="Mois" [compact]="true" />
          <app-select class="year" [options]="yearOptions()" [ngModel]="viewYear()" (ngModelChange)="setView($event, viewMonth())"
                      ariaLabel="Année" [compact]="true" />
        </div>
        <button type="button" class="nav" (click)="shiftMonth(1)" [attr.aria-disabled]="!canNext()" aria-label="Mois suivant">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
      </div>
      <div class="dow" aria-hidden="true">@for (d of dow; track $index) { <span>{{ d }}</span> }</div>
      <div class="grid" role="grid">
        @for (c of cells(); track c.iso) {
          <button type="button" class="day" role="gridcell" [attr.data-iso]="c.iso"
                  [class.out]="!c.inMonth" [class.today]="c.today" [class.sel]="c.iso === value()"
                  [class.range]="c.inRange" [class.edge]="c.edge" [class.off]="c.disabled"
                  [attr.aria-disabled]="c.disabled" [attr.aria-selected]="c.iso === value()" [attr.aria-label]="c.label"
                  [attr.tabindex]="c.iso === cursor() ? 0 : -1" (click)="pick(c)">{{ c.d }}</button>
        }
      </div>
      <div class="foot">
        <button type="button" class="link" (click)="pickToday()" [disabled]="todayOff()">Aujourd'hui</button>
        @if (hint()) { <span class="hint">{{ hint() }}</span> }
        <button type="button" class="link" (click)="clear(); close(true)">Effacer</button>
      </div>
    </div>
  }
  `,
  styleUrl: './date-field.scss'
})
export class DateFieldComponent implements ControlValueAccessor, Validator, OnDestroy {
  private static seq = 0;

  readonly min = input<string | null | undefined>(null);
  readonly max = input<string | null | undefined>(null);
  /** Période à surligner dans le calendrier (ex. début → fin). */
  readonly rangeStart = input<string | null | undefined>(null);
  readonly rangeEnd = input<string | null | undefined>(null);
  /** Mois affiché à l'ouverture quand le champ est vide (ex. il y a 30 ans pour une naissance). */
  readonly openAt = input<string | null | undefined>(null);
  readonly placeholder = input('jj/mm/aaaa');
  readonly ariaLabel = input('');
  readonly inputId = input('df-' + (++DateFieldComponent.seq));
  readonly minMessage = input('');
  readonly maxMessage = input('');
  readonly showMessage = input(true);
  readonly clearable = input(true);
  readonly hint = input('');
  /** Variante étroite (cartes) : 32 px, sans icône, boutons resserrés. */
  readonly compact = input(false);

  @ViewChild('inp', { static: true }) private inp!: ElementRef<HTMLInputElement>;
  private calEl: HTMLElement | null = null;
  @ViewChild('cal') set cal(ref: ElementRef<HTMLElement> | undefined) {
    this.calEl = ref?.nativeElement ?? null;
    if (this.calEl) {
      // Rendu dans <body> : échappe aux conteneurs à overflow / backdrop-filter (panneaux, modales).
      document.body.appendChild(this.calEl);
      this.place();
      setTimeout(() => this.focusCursor());
    }
  }

  readonly value = signal('');
  readonly text = signal('');
  readonly open = signal(false);
  readonly touched = signal(false);
  readonly disabled = signal(false);
  readonly cursor = signal(todayIso());
  readonly viewYear = signal(new Date().getFullYear());
  readonly viewMonth = signal(new Date().getMonth());
  readonly pos = signal({ top: 0, left: 0 });
  readonly placeUp = signal(false);

  readonly months = MONTHS_FR;
  readonly monthOptions = MONTHS_FR.map((m, i) => ({ value: i, label: m[0].toUpperCase() + m.slice(1) }));
  readonly yearOptions = computed(() => this.years().map(y => ({ value: y, label: String(y) })));
  readonly dow = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};
  private onValidatorChange: () => void = () => {};

  /** Texte saisi mais incomplet ou impossible (ex. 31/02/2026). */
  readonly formatError = computed(() => this.text().trim() !== '' && !parseFr(this.text()));
  readonly error = computed<'format' | 'min' | 'max' | null>(() => {
    if (this.formatError()) return 'format';
    const v = this.value();
    if (!v) return null;
    if (this.min() && v < this.min()!) return 'min';
    if (this.max() && v > this.max()!) return 'max';
    return null;
  });
  /** Hors bornes : visible tout de suite ; format : après la sortie du champ. */
  readonly showError = computed(() => {
    const e = this.error();
    return e === 'min' || e === 'max' || (e === 'format' && this.touched() && !this.open());
  });
  readonly message = computed(() => {
    switch (this.error()) {
      case 'format': return 'Date incomplète ou inexistante (jj/mm/aaaa).';
      case 'min': return this.minMessage() || `Au plus tôt le ${frDate(this.min())}.`;
      case 'max': return this.maxMessage() || `Au plus tard le ${frDate(this.max())}.`;
      default: return '';
    }
  });

  readonly years = computed(() => {
    const now = new Date().getFullYear();
    const lo = Math.min(this.min() ? +this.min()!.slice(0, 4) : now - 100, this.viewYear());
    const hi = Math.max(this.max() ? +this.max()!.slice(0, 4) : now + 10, this.viewYear());
    const out: number[] = [];
    for (let y = hi; y >= lo; y--) out.push(y);
    return out;
  });

  readonly cells = computed<Cell[]>(() => {
    const y = this.viewYear(), m = this.viewMonth();
    const first = new Date(y, m, 1, 12);
    const offset = (first.getDay() + 6) % 7; // lundi = 0
    const start = toIso(new Date(y, m, 1 - offset, 12));
    const today = todayIso(), min = this.min(), max = this.max();
    let rs = this.rangeStart() || null, re = this.rangeEnd() || null;
    if (rs && re && re < rs) [rs, re] = [re, rs];
    const out: Cell[] = [];
    for (let i = 0; i < 42; i++) {
      const iso = addDays(start, i);
      const d = fromIso(iso)!;
      const disabled = (!!min && iso < min) || (!!max && iso > max);
      out.push({
        iso, d: d.getDate(), inMonth: d.getMonth() === m, today: iso === today, disabled,
        inRange: !!rs && !!re && iso >= rs && iso <= re, edge: iso === rs || iso === re,
        label: `${DAYS_FR[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}${disabled ? ', indisponible' : ''}`
      });
    }
    return out;
  });

  readonly canPrev = computed(() => !this.min() || toIso(new Date(this.viewYear(), this.viewMonth(), 1, 12)) > this.min()!);
  readonly canNext = computed(() => !this.max() || toIso(new Date(this.viewYear(), this.viewMonth() + 1, 0, 12)) < this.max()!);
  readonly todayOff = computed(() => { const t = todayIso(); return (!!this.min() && t < this.min()!) || (!!this.max() && t > this.max()!); });

  private readonly reposition = () => this.place();

  constructor(private host: ElementRef<HTMLElement>) {
    // Bornes modifiées (ex. la date de début change) → le formulaire revalide ce champ.
    effect(() => { this.min(); this.max(); queueMicrotask(() => this.onValidatorChange()); });
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    this.calEl?.remove();
  }

  // --- ControlValueAccessor / Validator ---
  writeValue(v: string | null): void {
    const iso = fromIso(v ?? '') ? v! : '';
    this.value.set(iso);
    this.text.set(frDate(iso));
  }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  registerOnValidatorChange(fn: () => void): void { this.onValidatorChange = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); if (d) this.close(); }

  validate(_: AbstractControl): ValidationErrors | null {
    switch (this.error()) {
      case 'format': return { dateFormat: true };
      case 'min': return { dateMin: { min: this.min() } };
      case 'max': return { dateMax: { max: this.max() } };
      default: return null;
    }
  }

  // --- Saisie clavier ---
  onType(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const digits = el.value.replace(/\D/g, '').slice(0, 8);
    let t = digits.slice(0, 2);
    if (digits.length > 2) t += '/' + digits.slice(2, 4);
    if (digits.length > 4) t += '/' + digits.slice(4);
    // Le « / » apparaît dès que le jour ou le mois est complet, sauf quand on efface.
    const deleting = (ev as InputEvent).inputType?.startsWith('delete');
    if (!deleting && (digits.length === 2 || digits.length === 4)) t += '/';
    el.value = t;
    this.text.set(t);
    const iso = parseFr(t);
    this.commit(iso ?? '', false);
    if (iso) this.showMonthOf(iso);
  }

  onBlur(): void {
    setTimeout(() => {
      if (this.calEl?.contains(document.activeElement)) return;
      this.touched.set(true);
      this.onTouched();
    });
  }

  onInputKey(e: KeyboardEvent): void {
    if ((e.key === 'ArrowDown' && e.altKey) || (e.key === 'ArrowDown' && !this.open())) { e.preventDefault(); this.openCal(); }
    else if (e.key === 'Escape' && this.open()) { e.preventDefault(); e.stopPropagation(); this.close(true); }
  }

  focusInput(e: MouseEvent): void {
    if ((e.target as HTMLElement).tagName !== 'INPUT' && !(e.target as HTMLElement).closest('button')) this.inp.nativeElement.focus();
  }

  // --- Calendrier ---
  toggle(): void { this.open() ? this.close(true) : this.openCal(); }

  openCal(): void {
    if (this.disabled()) return;
    const base = this.value() || this.openAt() || todayIso();
    const c = clampIso(base, this.min(), this.max());
    this.cursor.set(c);
    this.showMonthOf(c);
    this.open.set(true);
  }

  close(refocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (refocus) this.inp.nativeElement.focus();
  }

  pick(c: Cell): void {
    if (c.disabled) return;
    this.commit(c.iso, true);
    this.touched.set(true);
    this.onTouched();
    this.close(true);
  }

  pickToday(): void {
    if (this.todayOff()) return;
    const t = todayIso();
    this.commit(t, true);
    this.close(true);
  }

  clear(): void { this.commit('', true); }

  setView(y: number, m: number): void { this.viewYear.set(y); this.viewMonth.set(m); this.place(); }

  shiftMonth(n: number): void {
    if ((n < 0 && !this.canPrev()) || (n > 0 && !this.canNext())) return;
    const d = new Date(this.viewYear(), this.viewMonth() + n, 1, 12);
    this.setView(d.getFullYear(), d.getMonth());
  }

  onCalKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(true); return; }
    if (!target.classList.contains('day')) return;
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(this.cursor(), -1), ArrowRight: () => addDays(this.cursor(), 1),
      ArrowUp: () => addDays(this.cursor(), -7), ArrowDown: () => addDays(this.cursor(), 7),
      Home: () => addDays(this.cursor(), -((fromIso(this.cursor())!.getDay() + 6) % 7)),
      End: () => addDays(this.cursor(), 6 - ((fromIso(this.cursor())!.getDay() + 6) % 7)),
      PageUp: () => addMonths(this.cursor(), e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(this.cursor(), e.shiftKey ? 12 : 1)
    };
    const mv = moves[e.key];
    if (!mv) return;
    e.preventDefault();
    const next = clampIso(mv(), this.min(), this.max());
    this.cursor.set(next);
    this.showMonthOf(next);
    setTimeout(() => this.focusCursor());
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocPointer(e: PointerEvent): void {
    if (!this.open()) return;
    const t = e.target as Node;
    // Le menu des mois/années est lui aussi rendu dans <body> : un clic dedans reste « dans » le calendrier.
    if (this.host.nativeElement.contains(t) || this.calEl?.contains(t) || (t as Element).closest?.('.sf-menu')) return;
    this.close();
    this.touched.set(true);
    this.onTouched();
  }

  // --- interne ---
  private commit(iso: string, syncText: boolean): void {
    if (syncText) this.text.set(frDate(iso));
    if (iso === this.value()) { this.onValidatorChange(); return; }
    this.value.set(iso);
    this.onChange(iso);
  }

  private showMonthOf(iso: string): void {
    const d = fromIso(iso);
    if (d) { this.viewYear.set(d.getFullYear()); this.viewMonth.set(d.getMonth()); }
  }

  private focusCursor(): void {
    this.calEl?.querySelector<HTMLElement>(`[data-iso="${this.cursor()}"]`)?.focus({ preventScroll: true });
  }

  private place(): void {
    if (!this.open()) return;
    const box = this.host.nativeElement.querySelector('.df')!.getBoundingClientRect();
    const w = 300, h = this.calEl?.offsetHeight || 360, gap = 6;
    const up = box.bottom + gap + h > usableBottom() && box.top - gap - h > 0;
    this.placeUp.set(up);
    this.pos.set({
      top: up ? box.top - gap - h : box.bottom + gap,
      left: Math.max(8, Math.min(box.left, window.innerWidth - w - 8))
    });
  }
}
