import { Component, computed, input, output } from '@angular/core';

/**
 * En-tête d'étapes des formulaires longs (5 questions au plus par étape).
 * Numéros cliquables pour revenir à une étape déjà vue, barre de progression animée,
 * annonce « Étape 2 sur 3 » pour les lecteurs d'écran. Le formulaire garde la main sur la validation.
 */
@Component({
  selector: 'app-form-steps',
  standalone: true,
  template: `
  <nav class="fs" aria-label="Étapes du formulaire">
    <ol>
      @for (l of labels(); track $index) {
        <li [class.done]="$index < current()" [class.now]="$index === current()">
          <button type="button" [disabled]="$index > reached()" (click)="go.emit($index)"
                  [attr.aria-current]="$index === current() ? 'step' : null" [attr.aria-label]="'Étape ' + ($index + 1) + ' : ' + l">
            <span class="dot" aria-hidden="true">
              @if ($index < current()) { <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg> } @else { {{ $index + 1 }} }
            </span>
            <span class="lb">{{ l }}</span>
          </button>
        </li>
      }
    </ol>
    <div class="bar" aria-hidden="true"><b [style.width.%]="progress()"></b></div>
    <p class="count" aria-live="polite">Étape {{ current() + 1 }} sur {{ labels().length }} · <b>{{ labels()[current()] }}</b></p>
  </nav>
  `,
  styles: [`
  :host { display: block; }
  .fs { display: flex; flex-direction: column; gap: 8px; }
  ol { list-style: none; margin: 0; padding: 0; display: flex; gap: 6px; }
  li { flex: 1; min-width: 0; }
  button { width: 100%; display: flex; align-items: center; gap: 8px; padding: 4px 2px; border: none; background: none; color: var(--text-subtle);
    font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; text-align: left; border-radius: 8px; }
  button:disabled { cursor: default; }
  button:not(:disabled):hover .lb { color: var(--text-primary); }
  button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-dim); }
  .dot { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700;
    border: 1.5px solid var(--border); background: var(--glass); color: var(--text-muted); transition: background .25s, border-color .25s, color .25s, transform .25s; }
  .dot svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .lb { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color .2s; }
  li.now .dot { background: var(--accent); border-color: var(--accent); color: var(--on-accent); transform: scale(1.08); box-shadow: 0 0 0 4px var(--accent-dim); }
  li.now .lb { color: var(--text-primary); }
  li.done .dot { background: var(--accent-dim); border-color: var(--accent); color: var(--accent-ink); }
  li.done .lb { color: var(--text-muted); }
  .bar { height: 4px; border-radius: 4px; background: color-mix(in srgb, var(--text-subtle) 22%, transparent); overflow: hidden; }
  .bar b { display: block; height: 100%; border-radius: 4px; background: var(--accent); transition: width .4s cubic-bezier(.2,.8,.2,1); }
  .count { margin: 0; font-size: 12.5px; color: var(--text-muted); }
  .count b { color: var(--text-primary); font-weight: 600; }
  /* Téléphone : seuls les numéros, le nom de l'étape est écrit dessous. */
  @media (max-width: 600px) { .lb { display: none; } ol { justify-content: space-between; } li { flex: none; } }
  @media (min-width: 601px) { .count { display: none; } }
  `]
})
export class FormStepsComponent {
  readonly labels = input.required<string[]>();
  readonly current = input(0);
  /** Dernière étape atteinte : on peut revenir à toutes celles d'avant, pas sauter en avant. */
  readonly reached = input(0);
  readonly go = output<number>();
  readonly progress = computed(() => ((this.current() + 1) / this.labels().length) * 100);
}
