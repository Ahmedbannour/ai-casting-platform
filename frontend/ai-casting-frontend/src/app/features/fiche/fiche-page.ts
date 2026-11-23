import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { FicheComponent } from './fiche';

/** P-083 · La fiche du projet en pleine page, depuis la page projet ou une notification. */
@Component({
  selector: 'app-fiche-page',
  standalone: true,
  imports: [RouterLink, FicheComponent],
  template: `
  <section class="page">
    <a class="back" [routerLink]="['/demandes', id()]">← Le projet</a>
    @if (id(); as i) { <app-fiche [requestId]="i" /> }
  </section>
  `,
  styles: [`
    :host { display: block; }
    .page { padding: 20px 32px 64px; max-width: 1180px; display: flex; flex-direction: column; gap: 14px; }
    .back { color: var(--text-muted); text-decoration: none; font-size: 13.5px; align-self: flex-start; }
    .back:hover { color: var(--text-primary); }
    @media (max-width: 900px) { .page { padding: 14px 14px 110px; } }
  `]
})
export class FichePageComponent {
  readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map(p => p.get('id'))), { initialValue: null });
}
