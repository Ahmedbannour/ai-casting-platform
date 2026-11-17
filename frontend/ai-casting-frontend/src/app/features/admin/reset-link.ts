import { Component, ElementRef, HostListener, Input, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * T-112 · Administration : lien de réinitialisation du mot de passe d'un compte (D-011).
 * Le lien est valable 1 heure, ne sert qu'une fois, et n'est affiché qu'à sa création.
 */
@Component({
  selector: 'app-reset-link',
  standalone: true,
  template: `
    <button type="button" class="key" (click)="toggle()" [attr.aria-expanded]="open()"
            [attr.aria-label]="'Lien de réinitialisation du mot de passe de ' + name" title="Mot de passe oublié : créer un lien">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/></svg>
    </button>
    @if (open()) {
      <div #pop class="pop" role="dialog" [style.top.px]="pos().top" [style.left.px]="pos().left" [attr.aria-label]="'Réinitialiser le mot de passe de ' + name">
        <b>Mot de passe oublié · {{ name }}</b>
        @if (link()) {
          <p>Envoyez ce lien à la personne. Il ne sert qu'une fois et expire à {{ until() }}.</p>
          <div class="row"><input readonly [value]="link()" aria-label="Lien de réinitialisation" (focus)="$any($event.target).select()" />
            <button type="button" class="go" (click)="copy()">{{ copied() ? 'Copié' : 'Copier' }}</button></div>
          <p class="small">Le lien ne sera plus affiché ensuite. Après le changement, ses autres sessions sont fermées.</p>
        } @else {
          <p>Un lien à usage unique, valable 1 heure, permet de choisir un nouveau mot de passe. Un nouveau lien annule le précédent.</p>
          <button type="button" class="go" [disabled]="busy()" (click)="create()">{{ busy() ? 'Création…' : 'Créer le lien' }}</button>
        }
        @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
      </div>
    }`,
  styles: [`
    :host { position: relative; display: inline-flex; }
    .key { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 8px; border: 1px solid var(--border); background: transparent; cursor: pointer; color: var(--text-muted);
      &:hover, &[aria-expanded="true"] { color: var(--accent); border-color: var(--accent); } svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; } }
    .pop { position: fixed; z-index: 1000; width: min(380px, calc(100vw - 16px)); padding: 14px; border-radius: 12px; background: var(--bg-surface);
      border: 1px solid var(--border); box-shadow: 0 14px 40px rgba(0,0,0,.35); display: grid; gap: 8px; text-align: left; font-size: 13.5px; }
    b { font-size: 14px; } p { margin: 0; color: var(--text-muted); line-height: 1.45; } .small { font-size: 12.5px; } .err { color: var(--danger); }
    .row { display: flex; gap: 6px; } input { flex: 1; min-width: 0; height: 34px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font: inherit; font-size: 12.5px; }
    .go { height: 34px; padding: 0 12px; border: 0; border-radius: 8px; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 600; cursor: pointer; justify-self: start; &:disabled { opacity: .6; } }
  `]
})
export class ResetLinkComponent implements OnDestroy {
  @Input({ required: true }) userId!: string;
  @Input() name = '';
  private readonly http = inject(HttpClient);
  private readonly el = inject(ElementRef);
  readonly open = signal(false);
  readonly link = signal('');
  readonly until = signal('');
  readonly busy = signal(false);
  readonly copied = signal(false);
  readonly error = signal('');
  readonly pos = signal({ top: 0, left: 0 });
  private popNode: HTMLElement | null = null;
  /** Le panneau est placé au niveau de la page : la liste des comptes (effet de flou) ne le recouvre plus. */
  @ViewChild('pop') set popRef(r: ElementRef<HTMLElement> | undefined) {
    this.popNode = r?.nativeElement ?? null;
    if (this.popNode && this.popNode.parentElement !== document.body) document.body.appendChild(this.popNode);
  }
  ngOnDestroy(): void { this.popNode?.remove(); }

  toggle(): void {
    if (!this.open()) {
      const b = (this.el.nativeElement as HTMLElement).querySelector('.key')!.getBoundingClientRect();
      const w = Math.min(380, window.innerWidth - 16);
      const below = b.bottom + 8 + 230 < window.innerHeight;
      this.pos.set({ top: below ? b.bottom + 8 : Math.max(8, b.top - 238), left: Math.max(8, Math.min(b.right - w, window.innerWidth - w - 8)) });
    }
    this.y0 = window.scrollY;
    this.open.set(!this.open()); if (!this.open()) { this.link.set(''); this.error.set(''); }
  }
  private y0 = 0;
  @HostListener('window:scroll') onScroll(): void { if (this.open() && Math.abs(window.scrollY - this.y0) > 60) { this.open.set(false); this.link.set(''); } }
  @HostListener('window:resize') onResize(): void { if (this.open()) { this.open.set(false); this.link.set(''); } }

  @HostListener('document:click', ['$event'])
  outside(e: Event): void { const t = e.target as Node; if (this.open() && !this.el.nativeElement.contains(t) && !this.popNode?.contains(t)) { this.open.set(false); this.link.set(''); } }
  @HostListener('document:keydown.escape') esc(): void { this.open.set(false); this.link.set(''); }

  create(): void {
    this.busy.set(true); this.error.set('');
    this.http.post<{ token: string; expiresAt: number }>(`${environment.apiUrl}/admin/users/${this.userId}/password-reset`, {}).subscribe({
      next: r => {
        this.busy.set(false);
        this.link.set(`${location.origin}/reinitialisation/${r.token}`);
        this.until.set(new Date(r.expiresAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Création impossible. Réessayez.'); }
    });
  }

  copy(): void {
    navigator.clipboard?.writeText(this.link()).then(() => { this.copied.set(true); setTimeout(() => this.copied.set(false), 2500); },
      () => this.error.set('Copie impossible : sélectionnez le lien et copiez-le.'));
  }
}
