import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';

/**
 * Zone de dépôt de fichier au design de l'application : glisser-déposer ou clic,
 * formats acceptés en pastilles, zone qui s'illumine quand un fichier la survole, barre animée pendant l'envoi.
 * Émet le fichier choisi ; le parent garde l'envoi et les messages.
 */
@Component({
  selector: 'app-dropzone',
  standalone: true,
  template: `
  <label class="drop" [class.over]="over()" [class.busy]="busy()" [class.off]="disabled()"
         (dragenter)="enter($event)" (dragover)="enter($event)" (dragleave)="leave($event)" (drop)="dropped($event)">
    <input #inp type="file" [accept]="accept()" [multiple]="multiple()" [disabled]="disabled() || busy()" (change)="picked($event)" [attr.aria-label]="title()" />
    <span class="ico" aria-hidden="true">
      @switch (icon()) {
        @case ('photo') { <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle class="arrow" cx="9" cy="10" r="1.7"/><path d="m21 16-5-5-9 8"/></svg> }
        @case ('sheet') { <svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path class="arrow" d="M9 13h6M9 17h6"/></svg> }
        @default { <svg viewBox="0 0 24 24"><path class="arrow" d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 14.5v3A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5v-3"/></svg> }
      }
    </span>
    <span class="txt">
      <b>{{ busy() ? (busyText() || 'Envoi en cours…') : over() ? (multiple() ? 'Lâchez les fichiers ici' : 'Lâchez le fichier ici') : title() }}</b>
      <small>{{ busy() ? 'Ne fermez pas la page pendant l’envoi.' : hint() || ((multiple() ? 'Glissez-les ici ou choisissez-les' : 'Glissez-le ici ou choisissez-le') + ' · ' + maxMb() + ' Mo maximum' + (multiple() ? ' par fichier' : '')) }}</small>
      @if (!busy() && formats().length) {
        <span class="chips">@for (f of formats(); track f) { <i>{{ f }}</i> }</span>
      }
    </span>
    @if (!busy()) { <span class="pick">{{ multiple() ? 'Choisir des fichiers' : 'Choisir un fichier' }}</span> }
    @if (busy()) { <span class="bar" aria-hidden="true"><b></b></span> }
  </label>
  `,
  styles: [`
  :host { display: block; flex: 1; min-width: 0; }
  .drop { position: relative; display: flex; align-items: center; gap: 16px; padding: 18px 18px; border-radius: 16px; cursor: pointer; overflow: hidden;
    border: 1.5px dashed color-mix(in srgb, var(--text-subtle) 55%, transparent);
    background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 6%, var(--glass)), var(--glass));
    transition: border-color .2s, background .2s, transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .2s; }
  .drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .drop:hover:not(.off), .drop:focus-within { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-dim); }
  .drop:hover:not(.off) .ico, .drop.over .ico { transform: translateY(-2px); }
  .drop:hover:not(.off) .arrow { animation: lift .9s ease-in-out infinite; }
  .drop.over { border-style: solid; border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, var(--glass)); transform: scale(1.015);
    box-shadow: 0 0 0 6px var(--accent-dim), 0 18px 40px color-mix(in srgb, var(--accent) 18%, transparent); }
  .drop.over .arrow { animation: lift .6s ease-in-out infinite; }
  .drop.off { opacity: .55; cursor: not-allowed; }
  .ico { flex: none; width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center;
    background: var(--accent); color: var(--on-accent); box-shadow: 0 8px 22px color-mix(in srgb, var(--accent) 35%, transparent); transition: transform .25s cubic-bezier(.2,1.4,.4,1); }
  .ico svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  @keyframes lift { 50% { transform: translateY(-3px); } }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .txt b { font-size: 15px; color: var(--text-primary); font-weight: 700; }
  .txt small { font-size: 13px; color: var(--text-muted); line-height: 1.4; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
  .chips i { font-style: normal; font-size: 11px; font-weight: 700; letter-spacing: .02em; padding: 3px 8px; border-radius: 999px;
    background: color-mix(in srgb, var(--text-subtle) 16%, transparent); color: var(--text-secondary); }
  .pick { flex: none; height: 38px; padding: 0 16px; border-radius: 999px; display: inline-flex; align-items: center; font-size: 13.5px; font-weight: 700;
    border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); transition: border-color .15s, color .15s; }
  .drop:hover:not(.off) .pick { border-color: var(--accent); color: var(--accent-ink); }
  .drop.busy { cursor: progress; border-style: solid; border-color: var(--accent); }
  .drop.busy .ico { animation: pulse 1.1s ease-in-out infinite; }
  @keyframes pulse { 50% { transform: scale(.92); } }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: color-mix(in srgb, var(--accent) 20%, transparent); overflow: hidden; }
  .bar b { position: absolute; top: 0; bottom: 0; width: 40%; background: var(--accent); border-radius: 3px; animation: run 1.1s ease-in-out infinite; }
  @keyframes run { from { left: -40%; } to { left: 100%; } }
  @media (max-width: 560px) {
    .drop { flex-wrap: wrap; padding: 16px; gap: 12px 14px; }
    .ico { width: 44px; height: 44px; }
    .pick { flex: 1 0 100%; justify-content: center; }
  }
  @media (prefers-reduced-motion: reduce) { .drop, .ico, .arrow, .bar b { animation: none !important; transition: none !important; } }
  `]
})
export class DropzoneComponent {
  readonly title = input('Déposer un fichier');
  readonly accept = input('');
  /** Formats affichés en pastilles (ex. PDF, Word…). */
  readonly formats = input<string[]>([]);
  readonly maxMb = input(20);
  readonly busy = input(false);
  readonly disabled = input(false);
  readonly multiple = input(false);
  /** Texte pendant l'envoi, et explication sous le titre (sinon : glisser ou choisir, poids maximum). */
  readonly busyText = input('');
  readonly hint = input('');
  readonly icon = input<'upload' | 'photo' | 'sheet'>('upload');
  /** Premier fichier (dépôt simple) et tous les fichiers (dépôt multiple). */
  readonly file = output<File>();
  readonly files = output<File[]>();
  readonly over = signal(false);
  private readonly inp = viewChild<ElementRef<HTMLInputElement>>('inp');
  private depth = 0;

  enter(e: DragEvent): void {
    if (this.disabled() || this.busy() || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    if (e.type === 'dragenter') this.depth++;
    this.over.set(true);
  }
  leave(e: DragEvent): void { if (--this.depth <= 0) { this.depth = 0; this.over.set(false); } }
  dropped(e: DragEvent): void {
    e.preventDefault(); this.depth = 0; this.over.set(false);
    if (this.disabled() || this.busy()) return;
    this.emit(Array.from(e.dataTransfer?.files ?? []));
  }
  picked(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.emit(Array.from(input.files ?? []));
    input.value = '';
  }
  private emit(list: File[]): void {
    if (!list.length) return;
    this.file.emit(list[0]);
    this.files.emit(this.multiple() ? list : [list[0]]);
  }
}
