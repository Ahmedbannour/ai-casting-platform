import { Component, DestroyRef, ElementRef, HostListener, Injectable, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

interface Item { id: string; kind: string; title: string; body: string | null; link: string | null; createdAt: number; read: boolean; }
interface Feed { unread: number; items: Item[]; }

/** État partagé par toutes les cloches (menu latéral et mobile) : une seule source, un seul rafraîchissement. */
@Injectable({ providedIn: 'root' })
export class NotificationStore {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/me/notifications`;
  readonly items = signal<Item[]>([]);
  readonly unread = signal(0);
  private users = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  attach(): void {
    if (this.users++ === 0) {
      this.load();
      this.timer = setInterval(() => { if (!document.hidden) this.load(); }, 60_000);
    }
  }
  detach(): void {
    if (--this.users === 0 && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  load(): void {
    this.http.get<Feed>(this.url).subscribe({ next: f => { this.items.set(f.items); this.unread.set(f.unread); }, error: () => {} });
  }
  readAll(): void { this.http.post<void>(`${this.url}/read`, {}).subscribe({ next: () => this.load() }); }
  read(id: string): void { this.http.post<void>(`${this.url}/${id}/read`, {}).subscribe({ next: () => this.load() }); }
}

/** T-096 · Cloche de notifications : avis du réalisateur, réponses, propositions, coordonnées, échéance du contrat. */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  template: `
  <button type="button" class="bell" (click)="toggle()" [attr.aria-expanded]="open()" aria-haspopup="dialog"
          [attr.aria-label]="unread() ? 'Notifications, ' + unread() + ' non lue' + (unread() > 1 ? 's' : '') : 'Notifications'" title="Notifications">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>
    @if (unread()) { <span class="badge">{{ unread() > 9 ? '9+' : unread() }}</span> }
  </button>
  @if (open()) {
    <section class="panel" role="dialog" aria-label="Notifications" (keydown.escape)="open.set(false)">
      <header>
        <h2>Notifications</h2>
        @if (unread()) { <button type="button" class="all" (click)="readAll()">Tout marquer comme lu</button> }
      </header>
      @if (items().length) {
        <ul>
          @for (n of items(); track n.id) {
            <li>
              <button type="button" class="item" [class.unread]="!n.read" [attr.data-k]="n.kind" (click)="go(n)">
                <span class="dot" aria-hidden="true"></span>
                <span class="txt"><b>{{ n.title }}</b>@if (n.body) {<span class="body">{{ n.body }}</span>}<span class="when">{{ ago(n.createdAt) }}</span></span>
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="none">Rien de nouveau. Les avis des réalisateurs, les réponses des acteurs et les propositions apparaîtront ici.</p>
      }
    </section>
  }
  `,
  styles: [`
  :host { position: relative; display: inline-flex; }
  .bell { position: relative; width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 9px;
    background: var(--glass); color: var(--text-muted); cursor: pointer; transition: color .15s, border-color .15s;
    &:hover, &[aria-expanded="true"] { color: var(--text-primary); border-color: var(--accent); } }
  .badge { position: absolute; top: -5px; right: -6px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 999px; background: var(--accent);
    color: var(--on-accent); font-size: 10.5px; font-weight: 800; display: grid; place-items: center; box-shadow: 0 0 0 2px var(--bg-surface); }
  .panel { position: fixed; top: 64px; left: 16px; z-index: 80; width: min(360px, calc(100vw - 32px)); max-height: min(520px, calc(100vh - 140px));
    overflow: auto; padding: 14px; border-radius: var(--radius-l); border: 1px solid var(--border); background: var(--glass-strong);
    -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); box-shadow: 0 24px 60px rgba(0,0,0,.4); animation: pop .22s cubic-bezier(.2,.8,.2,1) both; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
  h2 { font-size: 17px; font-stretch: 100%; }
  .all { border: none; background: none; color: var(--accent); font-size: 12.5px; font-weight: 600; cursor: pointer; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .item { width: 100%; display: flex; gap: 10px; text-align: left; padding: 9px 10px; border: none; border-radius: var(--radius-m); background: none;
    color: var(--text-muted); cursor: pointer; &:hover { background: var(--bg-hover); } }
  .item.unread { color: var(--text-primary); background: var(--accent-dim); }
  .dot { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: var(--text-subtle); }
  .item.unread .dot { background: var(--accent); }
  .item[data-k="CONTRAT"] .dot { background: var(--danger); }
  .txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 13.5px; line-height: 1.4; b { font-weight: 600; } }
  .body { font-size: 12.5px; color: var(--text-muted); }
  .when { font-size: 11.5px; color: var(--text-subtle); }
  .none { color: var(--text-muted); font-size: 13.5px; line-height: 1.5; padding: 6px 2px; }
  @keyframes pop { from { opacity: 0; transform: translateY(-6px); } }
  @media (max-width: 860px) { .panel { top: 16px; } }
  /* Cloche mobile, en haut à droite : le panneau s'ouvre sous elle */
  :host(.m-bell) .panel { top: 54px; left: auto; right: 12px; }
  @media (prefers-reduced-motion: reduce) { .panel { animation: none; } }
  `]
})
export class NotificationBellComponent implements OnInit {
  private readonly store = inject(NotificationStore);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  readonly open = signal(false);
  readonly items = this.store.items;
  readonly unread = this.store.unread;

  ngOnInit(): void {
    this.store.attach();
    this.destroyRef.onDestroy(() => this.store.detach());
  }

  toggle(): void { this.open.update(o => !o); if (this.open()) this.store.load(); }

  readAll(): void { this.store.readAll(); }

  go(n: Item): void {
    if (!n.read && n.kind !== 'CONTRAT') this.store.read(n.id);   // rappels de contrat : calculés, non stockés
    this.open.set(false);
    if (n.link) this.router.navigateByUrl(n.link);
  }

  ago(ms: number): string {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(ms));
  }

  @HostListener('document:click', ['$event'])
  outside(e: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }
}
