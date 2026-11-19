import { Component, OnInit, inject, signal } from '@angular/core';
import { MeService } from '../../core/services/me.service';
import { FigurationPickerComponent, FigurationType } from './figuration-picker';

/**
 * T-156 · Les acteurs inscrits avec Google ou Facebook (ou avant la v2) n'ont pas répondu à la question
 * de la figuration : elle leur est posée en haut de leur espace, une seule fois.
 */
@Component({
  selector: 'app-figuration-ask',
  standalone: true,
  imports: [FigurationPickerComponent],
  template: `
  @if (show()) {
    <section class="ask" aria-labelledby="fig-ask-title">
      <h2 id="fig-ask-title">Une question pour compléter votre fiche</h2>
      <p>Les réalisateurs cherchent aussi des figurants. Votre réponse décide si vous apparaissez pour ces rôles ; vous pourrez la changer dans « Mon profil ».</p>
      <app-figuration-picker [value]="value()" (valueChange)="value.set($event); error.set('')" [error]="error()" />
      <div class="row">
        @if (saved()) { <span class="ok" role="status">Réponse enregistrée.</span> }
        <button type="button" class="btn-primary" [disabled]="busy()" (click)="save()">{{ busy() ? 'Enregistrement…' : 'Enregistrer ma réponse' }}</button>
      </div>
    </section>
  }`,
  styles: [`
    .ask { padding: 20px; border-radius: 16px; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 6%, var(--glass, transparent)); display: flex; flex-direction: column; gap: 6px; }
    h2 { margin: 0; font-size: 18px; }
    p { margin: 0 0 10px; color: var(--text-muted); font-size: 14px; line-height: 1.5; max-width: 64ch; }
    .row { display: flex; align-items: center; justify-content: flex-end; gap: 12px; flex-wrap: wrap; }
    .ok { font-size: 13px; font-weight: 600; }
  `]
})
export class FigurationAskComponent implements OnInit {
  private readonly me = inject(MeService);
  readonly show = signal(false);
  readonly value = signal<FigurationType[] | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly saved = signal(false);

  ngOnInit(): void {
    this.me.actor().subscribe({ next: a => this.show.set((a as any).figuration == null), error: () => {} });
  }

  save(): void {
    const v = this.value();
    if (v === null) { this.error.set('Répondez par oui ou non ; si oui, cochez au moins un type.'); return; }
    this.busy.set(true);
    this.me.updateActor({ figuration: v }).subscribe({
      next: () => { this.busy.set(false); this.saved.set(true); setTimeout(() => this.show.set(false), 1200); },
      error: () => { this.busy.set(false); this.error.set('Enregistrement impossible. Réessayez dans un instant.'); }
    });
  }
}
