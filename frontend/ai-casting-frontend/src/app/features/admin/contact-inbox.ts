import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface Msg { id: string; name: string; email: string; organisation: string | null; profile: 'AGENCE' | 'ACTEUR' | 'AUTRE'; message: string; createdAt: number; read: boolean; }

/** Administration · messages reçus par le formulaire de contact de la vitrine. */
@Component({
  selector: 'app-contact-inbox',
  standalone: true,
  template: `
  <section class="inbox">
    <header><h2>Messages de la vitrine</h2>
      <p>{{ unread() ? unread() + ' non lu' + (unread() > 1 ? 's' : '') : 'Tout est lu' }} · copie par e-mail avec l'envoi automatique (T-118)</p></header>
    @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
    @if (!items().length && !error()) { <p class="none">Aucun message pour l'instant. Ils arriveront ici depuis la section « Contact » de la page d'accueil.</p> }
    <ul>
      @for (m of items(); track m.id) {
        <li [class.unread]="!m.read" (click)="open(m)">
          <div class="top"><b>{{ m.name }}</b>@if (m.organisation) { <span class="org">{{ m.organisation }}</span> }
            <span class="tag">{{ label[m.profile] }}</span><time>{{ when(m.createdAt) }}</time></div>
          <p class="body">{{ m.message }}</p>
          <a [href]="'mailto:' + m.email" (click)="$event.stopPropagation()">{{ m.email }}</a>
        </li>
      }
    </ul>
  </section>`,
  styles: [`
    .inbox header { margin-bottom: 14px; } h2 { margin: 0 0 4px; font-size: 20px; }
    header p, .none { color: var(--text-muted); font-size: 14px; margin: 0; }
    .err { color: var(--danger); }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    li { padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-surface); cursor: default; }
    li.unread { border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); cursor: pointer; }
    li.unread b::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); margin-right: 8px; vertical-align: 1px; }
    .top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 14px; }
    .org { color: var(--text-muted); }
    .tag { font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--accent-dim); color: var(--text-primary); }
    time { margin-left: auto; font-size: 12.5px; color: var(--text-subtle); }
    .body { margin: 8px 0; white-space: pre-wrap; line-height: 1.5; font-size: 14.5px; }
    a { color: var(--accent); font-size: 13.5px; }
  `]
})
export class ContactInboxComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/admin/contact-messages`;
  readonly items = signal<Msg[]>([]);
  readonly unread = signal(0);
  readonly error = signal('');
  readonly label = { AGENCE: 'Agence', ACTEUR: 'Acteur', AUTRE: 'Autre' };

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.http.get<{ unread: number; items: Msg[] }>(this.url).subscribe({
      next: r => { this.items.set(r.items); this.unread.set(r.unread); this.error.set(''); },
      error: () => this.error.set('Impossible de charger les messages. Réessayez.')
    });
  }

  open(m: Msg): void {
    if (m.read) return;
    this.http.post(`${this.url}/${m.id}/read`, {}).subscribe(() => this.load());
  }

  when(ms: number): string {
    return new Date(ms).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
