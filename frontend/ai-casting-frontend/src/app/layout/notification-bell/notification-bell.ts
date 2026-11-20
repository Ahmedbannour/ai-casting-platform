import { Component, DestroyRef, ElementRef, Injectable, OnInit, computed, inject, signal } from '@angular/core';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
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

/** T-096 · Cloche de notifications : avis du réalisateur, réponses, propositions, coordonnées, échéance du contrat.
 *  Le panneau est rendu dans la couche « overlay » du CDK, hors du menu latéral : jamais rogné ni transparent. */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CdkOverlayOrigin, CdkConnectedOverlay],
  template: `
  <button type="button" class="bell" cdkOverlayOrigin #origin="cdkOverlayOrigin" (click)="toggle()"
          [class.has-new]="unread()" [attr.aria-expanded]="open()" aria-haspopup="dialog"
          [attr.aria-label]="unread() ? 'Notifications, ' + unread() + ' non lue' + (unread() > 1 ? 's' : '') : 'Notifications'" title="Notifications">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>
    @if (unread()) { <span class="badge">{{ unread() > 9 ? '9+' : unread() }}</span> }
  </button>

  <ng-template cdkConnectedOverlay [cdkConnectedOverlayOrigin]="origin" [cdkConnectedOverlayOpen]="open()"
               [cdkConnectedOverlayPositions]="positions" [cdkConnectedOverlayPush]="true" [cdkConnectedOverlayViewportMargin]="12"
               (overlayOutsideClick)="outside($event)" (detach)="open.set(false)" (overlayKeydown)="key($event)">
    <section class="panel" role="dialog" aria-label="Notifications">
      <header>
        <div>
          <h2>Notifications</h2>
          <p class="sub">{{ unread() ? unread() + ' non lue' + (unread() > 1 ? 's' : '') : 'Tout est lu' }}</p>
        </div>
        @if (unread()) { <button type="button" class="all" (click)="readAll()">Tout marquer comme lu</button> }
        <button type="button" class="close" (click)="open.set(false)" aria-label="Fermer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </header>

      @if (items().length) {
        <div class="list">
          @for (g of groups(); track g.label) {
            <h3>{{ g.label }}</h3>
            <ul>
              @for (n of g.items; track n.id) {
                <li>
                  <button type="button" class="item" [class.unread]="!n.read" [attr.data-k]="n.kind" (click)="go(n)">
                    <span class="ic" aria-hidden="true">
                      @switch (n.kind) {
                        @case ('AVIS') { <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> }
                        @case ('REPONSE') { <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg> }
                        @case ('PROPOSITION') { <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg> }
                        @case ('COORDONNEES') { <svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg> }
                        @case ('CONTRAT') { <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg> }
                        @default { <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg> }
                      }
                    </span>
                    <span class="txt">
                      <b>{{ n.title }}</b>
                      @if (n.body) { <span class="body">{{ n.body }}</span> }
                      <span class="when">{{ ago(n.createdAt) }}</span>
                    </span>
                    @if (!n.read) { <span class="dot" aria-label="Non lue"></span> }
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      } @else {
        <div class="none">
          <span class="none-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg></span>
          <b>Aucune notification</b>
          <p>{{ emptyText }}</p>
        </div>
      }
    </section>
  </ng-template>
  `,
  styles: [`
  :host { position: relative; display: inline-flex; }
  .bell { position: relative; width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 10px;
    background: var(--glass); color: var(--text-muted); cursor: pointer; transition: color .15s, border-color .15s, background .15s; }
  .bell:hover, .bell[aria-expanded="true"] { color: var(--text-primary); border-color: var(--accent); background: var(--accent-dim); }
  .bell:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .badge { position: absolute; top: -6px; right: -7px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: var(--accent);
    color: var(--on-accent); font-size: 10.5px; font-weight: 800; display: grid; place-items: center; box-shadow: 0 0 0 2px var(--bg-primary); }

  /* Panneau : fond opaque (lisible au-dessus de tout), ombre franche, largeur fixe */
  .panel { width: min(380px, calc(100vw - 24px)); max-height: min(560px, calc(100vh - 96px)); display: flex; flex-direction: column;
    border-radius: var(--radius-l); border: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg-surface) 96%, var(--text-primary) 4%);
    box-shadow: 0 24px 64px rgba(0,0,0,.45), 0 2px 8px rgba(0,0,0,.25); color: var(--text-primary);
    font-family: var(--font); animation: pop .2s cubic-bezier(.2,.8,.2,1) both; overflow: hidden; }
  header { display: flex; align-items: flex-start; gap: 8px; padding: 16px 14px 12px 18px; border-bottom: 1px solid var(--border); }
  header > div { flex: 1; min-width: 0; }
  h2 { font-size: 17px; font-weight: 700; margin: 0; }
  .sub { margin: 2px 0 0; font-size: 12.5px; color: var(--text-muted); }
  .all { flex: none; border: none; background: none; color: var(--accent-ink); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
    padding: 6px 8px; border-radius: var(--radius-s); }
  .all:hover { background: var(--accent-dim); }
  .close { flex: none; width: 30px; height: 30px; display: grid; place-items: center; border: none; border-radius: var(--radius-s); background: none;
    color: var(--text-muted); cursor: pointer; }
  .close:hover { background: var(--bg-hover); color: var(--text-primary); }
  .list { overflow-y: auto; padding: 6px 8px 10px; overscroll-behavior: contain; }
  h3 { margin: 10px 10px 4px; font-size: 12px; font-weight: 600; color: var(--text-subtle); }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .item { width: 100%; display: grid; grid-template-columns: 34px minmax(0, 1fr) 10px; gap: 12px; align-items: start; text-align: left;
    padding: 10px; border: none; border-radius: var(--radius-m); background: none; color: var(--text-muted); font: inherit; cursor: pointer;
    transition: background .15s; }
  .item:hover { background: var(--bg-hover); }
  .item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .item.unread { color: var(--text-primary); }
  .ic { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--bg-hover); color: var(--text-muted); }
  .ic svg, .none-ic svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .item.unread .ic { background: var(--accent-dim); color: var(--accent-ink); }
  .item[data-k="CONTRAT"] .ic { background: color-mix(in srgb, var(--danger) 18%, transparent); color: var(--danger); }
  .item[data-k="REPONSE"].unread .ic { background: color-mix(in srgb, var(--keep) 20%, transparent); color: var(--keep); }
  .txt { display: flex; flex-direction: column; gap: 3px; min-width: 0; font-size: 13.5px; line-height: 1.4; }
  .txt b { font-weight: 600; overflow-wrap: anywhere; }
  .item:not(.unread) .txt b { font-weight: 500; }
  .body { font-size: 12.8px; color: var(--text-muted); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .when { font-size: 11.5px; color: var(--text-subtle); }
  .dot { width: 9px; height: 9px; margin-top: 6px; border-radius: 50%; background: var(--accent); }
  .none { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 28px 24px 30px; }
  .none-ic { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: var(--bg-hover); color: var(--text-muted); margin-bottom: 4px; }
  .none b { font-size: 14.5px; }
  .none p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--text-muted); max-width: 290px; }
  @keyframes pop { from { opacity: 0; transform: translateY(-6px) scale(.98); } }
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

  /** Sous la cloche, alignée à gauche ; sinon à droite (cloche mobile) ; sinon au-dessus. */
  positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 10 },
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 10 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -10 },
  ];

  readonly groups = computed(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const today = this.items().filter(n => n.createdAt >= start.getTime());
    const before = this.items().filter(n => n.createdAt < start.getTime());
    return [{ label: 'Aujourd’hui', items: today }, { label: 'Plus tôt', items: before }].filter(g => g.items.length);
  });

  readonly emptyText = 'Les avis des réalisateurs, les réponses des acteurs, les propositions de rôle et les rappels de contrat apparaîtront ici.';

  ngOnInit(): void {
    this.store.attach();
    this.destroyRef.onDestroy(() => this.store.detach());
    // Cloche mobile (en haut à droite) : le panneau s'aligne sur son bord droit.
    if (this.host.nativeElement.classList.contains('m-bell')) this.positions = [this.positions[1], this.positions[0], this.positions[2]];
  }

  toggle(): void { this.open.update(o => !o); if (this.open()) this.store.load(); }

  readAll(): void { this.store.readAll(); }

  go(n: Item): void {
    if (!n.read && n.kind !== 'CONTRAT') this.store.read(n.id);   // rappels de contrat : calculés, non stockés
    this.open.set(false);
    if (n.link) this.router.navigateByUrl(n.link);
  }

  /** Clic hors du panneau : fermer, sauf sur la cloche elle-même (elle gère déjà l'ouverture). */
  outside(e: MouseEvent): void {
    if (!this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') { this.open.set(false); (this.host.nativeElement.querySelector('.bell') as HTMLElement | null)?.focus(); }
  }

  ago(ms: number): string {
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    if (s < 172800) return 'hier';
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(ms));
  }
}
