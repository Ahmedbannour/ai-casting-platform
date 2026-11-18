import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface Rule { key: string; label: string; duration: string; }
interface Report { at: string; trigger: string; deleted: Record<string, number>; total: number; }

/** T-111 · Administration › Journal : durées de conservation, dernière purge, purge à la demande. */
@Component({
  selector: 'app-retention-panel',
  standalone: true,
  template: `
  <section class="ret" aria-labelledby="ret-h">
    <header>
      <div><h3 id="ret-h">Conservation des données</h3>
        <p>{{ schedule() }} · durées annoncées dans la politique de confidentialité.</p></div>
      <button type="button" class="run" [disabled]="busy()" (click)="run()">{{ busy() ? 'Purge…' : 'Lancer la purge maintenant' }}</button>
    </header>
    <ul>
      @for (r of rules(); track r.key) {
        <li><span>{{ r.label }}</span><b>{{ r.duration }}</b>
          @if (last()?.deleted?.[r.key]) { <em>{{ last()!.deleted[r.key] }} effacé{{ last()!.deleted[r.key] > 1 ? 's' : '' }}</em> }</li>
      }
    </ul>
    <p class="last" role="status">
      @if (last(); as l) { Dernière purge : {{ when(l.at) }} · {{ l.total ? l.total + ' ligne' + (l.total > 1 ? 's' : '') + ' effacée' + (l.total > 1 ? 's' : '') : 'rien à effacer' }} · {{ l.trigger }} }
      @else { Pas encore de purge depuis le dernier démarrage du serveur. }
    </p>
  </section>`,
  styles: [`
    .ret { border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; background: var(--glass, transparent); margin-bottom: 14px; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    h3 { margin: 0; font-size: 15px; } header p { margin: 2px 0 0; font-size: 13px; color: var(--text-muted); }
    .run { height: 36px; padding: 0 14px; border-radius: 9px; border: 1px solid var(--border); background: transparent; color: var(--text-primary); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer;
      &:hover { border-color: var(--accent); } &:disabled { opacity: .6; cursor: progress; } }
    ul { list-style: none; margin: 12px 0 8px; padding: 0; display: grid; gap: 1px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
    li { display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: var(--bg-surface); font-size: 13.5px;
      span { flex: 1; min-width: 0; color: var(--text-muted); } b { font-weight: 600; white-space: nowrap; }
      em { font-style: normal; font-size: 12px; padding: 1px 8px; border-radius: 99px; background: var(--accent-dim); } }
    .last { margin: 0; font-size: 12.5px; color: var(--text-subtle); }
  `]
})
export class RetentionPanelComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/admin/retention`;
  readonly rules = signal<Rule[]>([]);
  readonly schedule = signal('Chaque nuit');
  readonly last = signal<Report | null>(null);
  readonly busy = signal(false);

  ngOnInit(): void {
    this.http.get<{ rules: Rule[]; schedule: string; last: Report | null }>(this.url).subscribe({
      next: r => { this.rules.set(r.rules); this.schedule.set(r.schedule); this.last.set(r.last); }, error: () => {}
    });
  }

  run(): void {
    this.busy.set(true);
    this.http.post<Report>(`${this.url}/run`, {}).subscribe({
      next: r => { this.last.set(r); this.busy.set(false); }, error: () => this.busy.set(false)
    });
  }

  when(iso: string): string { return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
}
