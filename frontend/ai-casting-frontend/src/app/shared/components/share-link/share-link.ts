import { Component, computed, input, signal } from '@angular/core';

/**
 * Lien d'invitation prêt à partager : on le copie, ou on l'envoie par e-mail ou WhatsApp (gratuit, depuis l'appareil de l'utilisateur).
 * Le lien n'est montré qu'une fois : il ne pourra plus être affiché ensuite.
 */
@Component({
  selector: 'app-share-link',
  standalone: true,
  template: `
  <div class="sl" role="group" aria-label="Lien d'invitation">
    <p class="sl-head"><span class="sl-dot" aria-hidden="true"></span>{{ title() }}</p>
    <div class="sl-box">
      <input class="bare" readonly [value]="link()" aria-label="Lien d'invitation" (focus)="$any($event.target).select()" />
      <button type="button" class="sl-copy" (click)="copy()">{{ copied() ? 'Copié' : 'Copier' }}</button>
    </div>
    <div class="sl-go">
      <a [href]="mail()">E-mail</a>
      <a [href]="whatsapp()" target="_blank" rel="noopener">WhatsApp</a>
    </div>
    <small>Valable {{ days() }} jours, une seule fois. Ce lien ne s'affichera plus : envoyez-le maintenant.</small>
  </div>`,
  styles: [`
    .sl { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 14px; border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
      background: color-mix(in srgb, var(--accent) 8%, var(--glass)); animation: slIn .35s cubic-bezier(.2,.8,.2,1) both; min-width: 0; }
    .sl-head { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: var(--text-primary); }
    .sl-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px var(--accent-dim); }
    .sl-box { display: flex; gap: 6px; min-width: 0; }
    .sl-box input { flex: 1; width: 0; min-width: 0; height: 38px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--border);
      background: var(--bg-primary); color: var(--text-muted); font: inherit; font-size: 13px; text-overflow: ellipsis; }
    .sl-copy { flex: none; height: 38px; padding: 0 14px; border-radius: 10px; border: 0; background: var(--accent); color: var(--on-accent);
      font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: transform .15s; }
    .sl-copy:active { transform: scale(.96); }
    .sl-go { display: flex; gap: 6px; flex-wrap: wrap; }
    .sl-go a { height: 32px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border);
      color: var(--text-primary); text-decoration: none; font-size: 13px; font-weight: 600; }
    .sl-go a:hover { border-color: var(--accent); }
    small { color: var(--text-subtle); font-size: 12px; line-height: 1.4; }
    @keyframes slIn { from { opacity: 0; transform: translateY(6px) scale(.98); } }
    @media (prefers-reduced-motion: reduce) { .sl { animation: none; } }
  `]
})
export class ShareLinkComponent {
  readonly link = input.required<string>();
  readonly email = input('');
  readonly subject = input('Invitation sur Cercle');
  readonly message = input('');
  readonly title = input('Lien prêt à envoyer');
  readonly days = input(14);
  readonly copied = signal(false);

  readonly body = computed(() => (this.message() ? this.message() + '\n\n' : '') + this.link());
  readonly mail = computed(() => `mailto:${encodeURIComponent(this.email())}?subject=${encodeURIComponent(this.subject())}&body=${encodeURIComponent(this.body())}`);
  readonly whatsapp = computed(() => `https://wa.me/?text=${encodeURIComponent(this.body())}`);

  copy(): void {
    const done = () => { this.copied.set(true); setTimeout(() => this.copied.set(false), 1800); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(this.link()).then(done, () => this.fallback(done));
    else this.fallback(done);
  }

  private fallback(done: () => void): void {
    const t = document.createElement('textarea');
    t.value = this.link(); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); done(); } finally { t.remove(); }
  }
}
