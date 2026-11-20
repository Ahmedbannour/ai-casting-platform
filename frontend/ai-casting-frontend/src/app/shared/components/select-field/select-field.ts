import { Component, ElementRef, HostListener, NgZone, OnDestroy, inject, ViewChild, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { usableBottom } from '../../forms/viewport';

export type SelectOption = string | { value: string | number; label: string };
interface Opt { value: string | number; label: string; }

/**
 * Liste déroulante au design de l'application (remplace le menu natif du système).
 * Bouton vitré + menu flottant rendu dans <body>, coche sur l'option choisie,
 * clavier : ↑ ↓ Début Fin Entrée Échap, et saut par première lettre.
 * Fonctionne avec ngModel et formControlName.
 */
@Component({
  selector: 'app-select',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectFieldComponent), multi: true }],
  template: `
  <button #trigger type="button" class="sf" [class.open]="open()" [class.placeholder]="!selected()" [class.compact]="compact()"
          [id]="inputId()" [disabled]="disabled()" role="combobox" aria-haspopup="listbox"
          [attr.aria-expanded]="open()" [attr.aria-controls]="listId" [attr.aria-label]="ariaLabel() || null"
          [attr.aria-activedescendant]="open() && cursor() >= 0 ? listId + '-' + cursor() : null"
          (click)="toggle()" (keydown)="onKey($event)" (blur)="onTouched()">
    <span class="val">{{ selected()?.label ?? placeholder() }}</span>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
  </button>

  @if (open()) {
    <ul #menu class="sf-menu" role="listbox" [id]="listId" [attr.aria-label]="ariaLabel() || null" [class.up]="up()"
        [style.top.px]="pos().top" [style.left.px]="pos().left" [style.min-width.px]="pos().width" (mousedown)="$event.preventDefault()">
      @for (o of opts(); track o.value; let i = $index) {
        <li role="option" [id]="listId + '-' + i" [class.active]="i === cursor()" [class.sel]="o.value === value()"
            [attr.aria-selected]="o.value === value()" (mouseenter)="cursor.set(i)" (click)="pick(o)">
          <span>{{ o.label }}</span>
          @if (o.value === value()) {
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
          }
        </li>
      }
    </ul>
  }
  `,
  styleUrl: './select-field.scss'
})
export class SelectFieldComponent implements ControlValueAccessor, OnDestroy {
  private static seq = 0;

  readonly options = input<SelectOption[]>([]);
  readonly placeholder = input('Choisir');
  readonly ariaLabel = input('');
  readonly inputId = input<string | null>(null);
  /** Variante basse (32 px), pour les cartes et les barres d'outils. */
  readonly compact = input(false);

  readonly listId = 'sf-' + (++SelectFieldComponent.seq);
  readonly value = signal<string | number>('');
  readonly open = signal(false);
  readonly disabled = signal(false);
  readonly cursor = signal(-1);
  readonly pos = signal({ top: 0, left: 0, width: 0 });
  readonly up = signal(false);

  readonly opts = computed<Opt[]>(() =>
    this.options().map(o => (typeof o === 'string' ? { value: o, label: o } : o)));
  readonly selected = computed(() => this.opts().find(o => o.value === this.value()) ?? null);

  @ViewChild('trigger', { static: true }) private trigger!: ElementRef<HTMLButtonElement>;
  private menuEl: HTMLElement | null = null;
  @ViewChild('menu') set menu(ref: ElementRef<HTMLElement> | undefined) {
    this.menuEl = ref?.nativeElement ?? null;
    if (this.menuEl) {
      document.body.appendChild(this.menuEl);   // échappe aux panneaux à overflow / backdrop-filter
      this.place();
      this.scrollToCursor();
    }
  }

  private onChange: (v: string | number) => void = () => {};
  onTouched: () => void = () => {};
  private typed = '';
  private typedAt = 0;
  private readonly zone = inject(NgZone);
  /** Écouté hors d'Angular et en mode passif : fermé, le champ ne coûte rien pendant le défilement de la page. */
  private readonly reposition = () => { if (this.open()) this.zone.run(() => this.place()); };

  constructor(private host: ElementRef<HTMLElement>) {
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.reposition, { capture: true, passive: true });
      window.addEventListener('resize', this.reposition, { passive: true });
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    this.menuEl?.remove();
  }

  writeValue(v: string | number | null): void { this.value.set(v ?? ''); }
  registerOnChange(fn: (v: string | number) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); if (d) this.open.set(false); }

  toggle(): void { this.open() ? this.close() : this.openMenu(); }

  openMenu(): void {
    if (this.disabled()) return;
    const i = this.opts().findIndex(o => o.value === this.value());
    this.cursor.set(i >= 0 ? i : 0);
    this.open.set(true);
  }

  close(): void { this.open.set(false); }

  pick(o: Opt): void {
    if (o.value !== this.value()) { this.value.set(o.value); this.onChange(o.value); }
    this.close();
    this.trigger.nativeElement.focus();
  }

  onKey(e: KeyboardEvent): void {
    const n = this.opts().length;
    if (!n) return;
    const move = (i: number) => { this.cursor.set(Math.max(0, Math.min(n - 1, i))); this.scrollToCursor(); };
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); this.open() ? move(this.cursor() + 1) : this.openMenu(); return;
      case 'ArrowUp': e.preventDefault(); this.open() ? move(this.cursor() - 1) : this.openMenu(); return;
      case 'Home': if (this.open()) { e.preventDefault(); move(0); } return;
      case 'End': if (this.open()) { e.preventDefault(); move(n - 1); } return;
      case 'Enter': case ' ':
        e.preventDefault();
        if (this.open() && this.cursor() >= 0) this.pick(this.opts()[this.cursor()]); else this.openMenu();
        return;
      case 'Escape':
        if (this.open()) { e.preventDefault(); e.stopPropagation(); this.close(); }
        return;
      case 'Tab': this.close(); return;
    }
    // Saut à l'option qui commence par les lettres tapées.
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      this.typed = (now - this.typedAt < 700 ? this.typed : '') + e.key.toLowerCase();
      this.typedAt = now;
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const i = this.opts().findIndex(o => norm(o.label).startsWith(norm(this.typed)));
      if (i >= 0) {
        if (this.open()) move(i); else this.pick(this.opts()[i]);
      }
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocPointer(e: PointerEvent): void {
    if (!this.open()) return;
    const t = e.target as Node;
    if (this.host.nativeElement.contains(t) || this.menuEl?.contains(t)) return;
    this.close();
  }

  private scrollToCursor(): void {
    setTimeout(() => this.menuEl?.querySelector<HTMLElement>(`#${this.listId}-${this.cursor()}`)?.scrollIntoView({ block: 'nearest' }));
  }

  private place(): void {
    if (!this.open()) return;
    const r = this.trigger.nativeElement.getBoundingClientRect();
    const h = Math.min(this.menuEl?.offsetHeight || 280, 300), gap = 6;
    const up = r.bottom + gap + h > usableBottom() && r.top - gap - h > 0;
    const w = Math.max(r.width, this.menuEl?.offsetWidth || 0);
    this.up.set(up);
    this.pos.set({
      top: up ? r.top - gap - h : r.bottom + gap,
      left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)),
      width: r.width
    });
  }
}
