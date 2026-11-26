import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CrewContact, CrewView, FicheService, Sheet } from './fiche.service';

/**
 * P-087 · L'équipe technique du film, comme une feuille de service : des postes fixes par département.
 * Le producer ou la réalisation renseigne une personne, ou envoie un lien d'invitation (WhatsApp, e-mail, copie).
 * L'invité saisit son mot de passe et entre dans la room. Les coordonnées ne sont visibles que de l'équipe de tournage.
 */
@Component({
  selector: 'app-crew',
  standalone: true,
  imports: [FormsModule],
  template: `
  <section class="crew" aria-labelledby="crew-h">
    <header class="c-head">
      <h3 id="crew-h">L’équipe technique</h3>
      <p class="c-sum">{{ filled() }} poste{{ filled() > 1 ? 's' : '' }} pourvu{{ filled() > 1 ? 's' : '' }} sur {{ crew().length }}@if (pending()) { · {{ pending() }} invitation{{ pending() > 1 ? 's' : '' }} en attente }</p>
      <div class="c-bar" aria-hidden="true"><b [style.width.%]="crew().length ? filled() / crew().length * 100 : 0"></b></div>
    </header>
    @if (msg()) { <p class="c-ok" role="status">{{ msg() }}</p> }
    @if (err()) { <p class="c-err" role="alert">{{ err() }}</p> }

    @for (g of groups(); track g.dept) {
      <div class="dept">
        <h4>{{ g.dept }}</h4>
        <ul>
          @for (c of g.posts; track c.key) {
            <li class="post" [attr.data-s]="c.status" [class.open]="open() === c.key">
              <div class="p-main">
                <div class="p-id">
                  <span class="p-label">{{ c.label }}</span>
                  <span class="pill" [attr.data-s]="c.status">{{ statusLabel(c) }}</span>
                </div>
                @if (c.name) {
                  <p class="p-name">{{ c.name }}@if (c.me) { <small>· vous</small> }</p>
                  @if (c.contacts) {
                    <div class="p-contacts">
                      @if (c.phone) {
                        <a [href]="'tel:' + tel(c.phone)" class="ct">☎ {{ c.phone }}</a>
                        <a [href]="'https://wa.me/' + digits(c.phone)" target="_blank" rel="noopener" class="ct" [attr.aria-label]="'Écrire sur WhatsApp à ' + c.name">WhatsApp</a>
                      }
                      @if (c.email) { <a [href]="'mailto:' + c.email" class="ct">{{ c.email }}</a> }
                      @if (c.address || c.city) { <span class="ct addr">{{ addr(c) }}</span> }
                      @if (mapUrl(c); as m) { <a [href]="m" target="_blank" rel="noopener" class="ct">Voir sur la carte ↗</a> }
                    </div>
                  } @else if (c.city) { <p class="p-meta">{{ c.city }}</p> }
                } @else if (c.status === 'A_POURVOIR') { <p class="p-meta">Personne pour l’instant.</p> }
                @if (c.status === 'INVITE') { <p class="p-meta">Lien envoyé{{ c.invitedAt ? ' le ' + day(c.invitedAt) : '' }} : la personne n’a pas encore rejoint.</p> }
              </div>
              @if (canManage() || c.me) {
                <div class="p-actions">
                  @if (canManage() && c.status !== 'CONFIRME') { <button type="button" class="tool strong" (click)="startInvite(c)">{{ c.status === 'INVITE' ? 'Nouveau lien' : 'Inviter par lien' }}</button> }
                  <button type="button" class="tool" (click)="startEdit(c)">{{ c.me ? 'Mes coordonnées' : c.name ? 'Modifier' : 'Renseigner' }}</button>
                  @if (canManage() && c.status !== 'A_POURVOIR') { <button type="button" class="tool" (click)="remove(c)">Retirer</button> }
                </div>
              }

              @if (open() === c.key && panel() === 'edit') {
                <form class="p-form" (ngSubmit)="save(c)">
                  <div class="grid">
                    <label>Nom et prénom<input name="n" [(ngModel)]="draft.name" [disabled]="c.me && !canManage()" autocomplete="name" /></label>
                    <label>Téléphone<input name="p" type="tel" [(ngModel)]="draft.phone" placeholder="+216 …" autocomplete="tel" /></label>
                    <label>E-mail<input name="e" type="email" [(ngModel)]="draft.email" autocomplete="email" /></label>
                    <label>Ville<input name="v" [(ngModel)]="draft.city" autocomplete="address-level2" /></label>
                    <label class="wide">Adresse<input name="a" [(ngModel)]="draft.address" autocomplete="street-address" /></label>
                    <label class="wide">Localisation <em>lien Google Maps ou coordonnées GPS</em><input name="l" [(ngModel)]="draft.location" placeholder="https://maps.app.goo.gl/… ou 36.80, 10.18" /></label>
                  </div>
                  <div class="f-actions">
                    <button type="submit" class="go" [disabled]="busy()">Enregistrer</button>
                    <button type="button" class="ghost" (click)="close()">Annuler</button>
                  </div>
                </form>
              }

              @if (open() === c.key && panel() === 'invite') {
                <div class="p-form invite">
                  @if (!link()) {
                    <p class="i-lead">La personne ouvre le lien, saisit son mot de passe (celui de son compte, ou celui qu’elle crée) et rejoint le poste et la room.</p>
                    <div class="grid">
                      <label>Nom <em>facultatif</em><input name="in" [(ngModel)]="draft.name" /></label>
                      <label>E-mail <em>facultatif, pré-rempli pour elle</em><input name="ie" type="email" [(ngModel)]="draft.email" /></label>
                      <label>Téléphone <em>pour WhatsApp</em><input name="ip" type="tel" [(ngModel)]="draft.phone" placeholder="+216 …" /></label>
                    </div>
                    <div class="f-actions">
                      <button type="button" class="go" [disabled]="busy()" (click)="invite(c)">Créer le lien d’invitation</button>
                      <button type="button" class="ghost" (click)="close()">Annuler</button>
                    </div>
                  } @else {
                    <p class="i-lead"><b>Lien prêt</b>, valable 14 jours et à usage unique. Envoyez-le :</p>
                    <div class="i-link"><input readonly [value]="link()" aria-label="Lien d’invitation" (focus)="$any($event.target).select()" /></div>
                    <div class="f-actions">
                      <a class="go" [href]="whatsapp(c)" target="_blank" rel="noopener">WhatsApp</a>
                      <a class="ghost" [href]="mail(c)">E-mail</a>
                      <button type="button" class="ghost" (click)="copy()">{{ copied() ? 'Copié ✓' : 'Copier le lien' }}</button>
                      @if (canShare) { <button type="button" class="ghost" (click)="nativeShare(c)">Partager…</button> }
                      <button type="button" class="ghost" (click)="close()">Fermer</button>
                    </div>
                  }
                </div>
              }
            </li>
          }
        </ul>
      </div>
    }
  </section>
  `,
  styles: [`
    :host { display: block; margin-top: 18px; }
    .crew { display: flex; flex-direction: column; gap: 14px; }
    .c-head h3 { margin: 0; font-size: 16px; }
    .c-sum { margin: 2px 0 6px; font-size: 13px; color: var(--text-muted); }
    .c-bar { height: 6px; border-radius: 6px; background: color-mix(in srgb, var(--text-subtle) 20%, transparent); overflow: hidden; }
    .c-bar b { display: block; height: 100%; background: var(--success); border-radius: 6px; transition: width .6s cubic-bezier(.2,.8,.2,1); }
    .c-ok { margin: 0; font-size: 13.5px; color: var(--success); } .c-err { margin: 0; font-size: 13.5px; color: var(--danger); }
    .dept h4 { margin: 0 0 6px; font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: none; }
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .post { display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; align-items: start; padding: 10px 12px; border-radius: 12px; background: var(--bg-secondary); border: 1px solid transparent; }
    .post[data-s="A_POURVOIR"] { background: none; border: 1px dashed var(--border); }
    .post.open { border-color: var(--accent); }
    .p-id { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .p-label { font-weight: 700; font-size: 14.5px; }
    .pill { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--text-subtle) 16%, transparent); color: var(--text-secondary); }
    .pill[data-s="CONFIRME"] { background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--success); }
    .pill[data-s="INVITE"] { background: var(--accent-dim); color: var(--accent-ink); }
    .p-name { margin: 4px 0 0; font-size: 14.5px; } .p-name small { color: var(--text-muted); }
    .p-meta { margin: 4px 0 0; font-size: 12.5px; color: var(--text-muted); }
    .p-contacts { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 4px; font-size: 13px; }
    .ct { color: var(--text-secondary); text-decoration: none; } a.ct:hover { color: var(--accent-ink); text-decoration: underline; }
    .p-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
    .tool { min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .tool:hover, .tool:focus-visible { border-color: var(--accent); color: var(--text-primary); }
    .tool.strong { border-color: var(--accent); color: var(--accent-ink); background: var(--accent-dim); }
    .p-form { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 10px; padding-top: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
    .grid .wide { grid-column: 1 / -1; }
    @container fiche (max-width: 640px) { .grid { grid-template-columns: 1fr; } .post { grid-template-columns: 1fr; } .p-actions { justify-content: flex-start; } }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; font-weight: 600; } label em { font-style: normal; font-weight: 400; color: var(--text-subtle); }
    input { min-height: 40px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); padding: 0 10px; font: inherit; width: 100%; box-sizing: border-box; }
    .f-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .go, .ghost { min-height: 40px; padding: 0 16px; border-radius: 999px; font: inherit; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; text-decoration: none; }
    .go { border: 0; background: var(--accent); color: var(--on-accent); } .go:disabled { opacity: .5; }
    .ghost { border: 1px solid var(--border); background: none; color: var(--text-primary); font-weight: 600; }
    .i-lead { margin: 0; font-size: 13.5px; color: var(--text-secondary); line-height: 1.45; }
    .i-link input { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12.5px; }
    @media (pointer: coarse) { .tool { min-height: 44px; } }
  `]
})
export class CrewComponent {
  private readonly api = inject(FicheService);
  readonly requestId = input.required<string>();
  readonly crew = input.required<CrewView[]>();
  readonly canManage = input(false);
  readonly changed = output<Sheet>();

  readonly open = signal<string | null>(null);
  readonly panel = signal<'edit' | 'invite'>('edit');
  readonly busy = signal(false);
  readonly msg = signal('');
  readonly err = signal('');
  readonly link = signal('');
  readonly copied = signal(false);
  readonly canShare = typeof navigator !== 'undefined' && !!navigator.share;
  draft: CrewContact = {};

  readonly filled = computed(() => this.crew().filter(c => c.status === 'CONFIRME' || c.status === 'RENSEIGNE').length);
  readonly pending = computed(() => this.crew().filter(c => c.status === 'INVITE').length);
  readonly groups = computed(() => {
    const m = new Map<string, CrewView[]>();
    for (const c of this.crew()) m.set(c.dept, [...(m.get(c.dept) ?? []), c]);
    return [...m.entries()].map(([dept, posts]) => ({ dept, posts }));
  });

  statusLabel(c: CrewView): string {
    return { A_POURVOIR: 'À pourvoir', RENSEIGNE: 'Renseigné', INVITE: 'Invitation envoyée', CONFIRME: 'Confirmé ✓' }[c.status];
  }
  startEdit(c: CrewView): void {
    this.draft = { name: c.name, phone: c.phone, email: c.email, address: c.address, city: c.city, location: c.location };
    this.panel.set('edit'); this.open.set(c.key); this.err.set(''); this.msg.set('');
  }
  startInvite(c: CrewView): void {
    this.draft = { name: c.name, email: c.email, phone: c.phone };
    this.link.set(''); this.copied.set(false); this.panel.set('invite'); this.open.set(c.key); this.err.set(''); this.msg.set('');
  }
  close(): void { this.open.set(null); this.link.set(''); }

  save(c: CrewView): void {
    this.busy.set(true); this.err.set('');
    this.api.saveCrew(this.requestId(), c.key, this.draft).subscribe({
      next: s => { this.busy.set(false); this.close(); this.msg.set(`${c.label} : enregistré.`); this.changed.emit(s); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.err.set(e.error?.message || 'L’enregistrement a échoué.'); }
    });
  }
  invite(c: CrewView): void {
    this.busy.set(true); this.err.set('');
    this.api.inviteCrew(this.requestId(), c.key, this.draft).subscribe({
      next: r => { this.busy.set(false); this.link.set(location.origin + r.path); this.api.forRequest(this.requestId()).subscribe(s => this.changed.emit(s)); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.err.set(e.error?.message || 'Le lien n’a pas pu être créé.'); }
    });
  }
  remove(c: CrewView): void {
    if (!confirm(`Retirer ${c.name || 'la personne'} du poste « ${c.label} » ?`)) return;
    this.api.clearCrew(this.requestId(), c.key).subscribe({
      next: s => { this.msg.set(`${c.label} : poste libéré.`); this.changed.emit(s); },
      error: (e: HttpErrorResponse) => this.err.set(e.error?.message || 'Le retrait a échoué.')
    });
  }

  private text(c: CrewView): string {
    return `Bonjour${this.draft.name ? ' ' + this.draft.name.split(' ')[0] : ''}, je vous invite comme ${c.label.toLowerCase()} sur notre tournage. Ouvrez ce lien pour rejoindre l’équipe et la room du projet : ${this.link()}`;
  }
  whatsapp(c: CrewView): string { const d = this.digits(this.draft.phone ?? ''); return `https://wa.me/${d}?text=${encodeURIComponent(this.text(c))}`; }
  mail(c: CrewView): string { return `mailto:${this.draft.email ?? ''}?subject=${encodeURIComponent('Invitation · ' + c.label)}&body=${encodeURIComponent(this.text(c))}`; }
  copy(): void { navigator.clipboard?.writeText(this.link()).then(() => this.copied.set(true), () => this.err.set('Copie refusée par le navigateur : sélectionnez le lien.')); }
  nativeShare(c: CrewView): void { navigator.share?.({ title: 'Invitation · ' + c.label, text: this.text(c) }).catch(() => {}); }

  digits(p: string): string { return (p || '').replace(/[^\d]/g, ''); }
  tel(p: string): string { return (p || '').replace(/[^\d+]/g, ''); }
  mapUrl(c: CrewView): string | null {
    if (c.location && /^https:\/\//i.test(c.location)) return c.location;
    if (c.location && /^-?\d/.test(c.location)) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(c.location);
    if (c.address || c.city) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([c.address, c.city].filter(x => !!x).join(', '));
    return null;
  }
  addr(c: CrewView): string { return [c.address, c.city].filter(x => !!x).join(', '); }
  day(iso: string): string { const d = new Date(iso); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }); }
}
