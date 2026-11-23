import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DemandeDetail, DemandeService, PendingInvitation } from '../../core/services/demande.service';
import { ProductionService } from '../../core/services/production.service';
import { ShareLinkComponent } from '../../shared/components/share-link/share-link';

type Kind = 'MARQUE' | 'AGENCE_MARKETING';
interface Slot { kind: Kind; label: string; joined: string | null; hint: string; }

/**
 * Le producer invite la marque et l'agence marketing du projet. Compte déjà inscrit : rattaché tout de suite.
 * Sinon : un lien à usage unique, à envoyer par e-mail ou WhatsApp.
 */
@Component({
  selector: 'app-invite-card',
  standalone: true,
  imports: [FormsModule, ShareLinkComponent],
  template: `
  <div class="card invite">
    <h2>Inviter l'équipe du projet</h2>
    <p class="muted">La marque écrit sa V0 et l'envoie à l'agence que vous invitez. Déjà inscrits sur Cercle : ils rejoignent le projet tout de suite.</p>
    <ul class="slots">
      @for (s of slots(); track s.kind) {
        <li [class.ok]="!!s.joined">
          <span class="badge" aria-hidden="true">@if (s.joined) { ✓ } @else { {{ s.kind === 'MARQUE' ? 'M' : 'A' }} }</span>
          <div class="who">
            <small>{{ s.label }}</small>
            @if (s.joined) {
              <b>{{ s.joined }}</b><span class="muted">a rejoint le projet</span>
            } @else if (pendingFor(s.kind); as p) {
              <b>Invitation envoyée</b><span class="muted">{{ p.email }} · lien valable jusqu'au {{ day(p.expiresAt) }}</span>
              <div class="acts">
                <button type="button" class="link" (click)="open.set(s.kind); email[s.kind] = p.email">Nouveau lien</button>
                <button type="button" class="link danger" (click)="revoke(p)" [disabled]="busy()">Annuler</button>
              </div>
            } @else {
              <span class="muted">{{ s.hint }}</span>
            }
          </div>
          @if (!s.joined && open() !== s.kind && !pendingFor(s.kind)) {
            <button type="button" class="send sm" (click)="open.set(s.kind)">Inviter</button>
          }
          @if (open() === s.kind) {
            <form class="mail" (ngSubmit)="invite(s.kind)" (input)="error.set('')">
              <input name="m{{ s.kind }}" type="email" [(ngModel)]="email[s.kind]" autocomplete="email" inputmode="email"
                     [placeholder]="s.kind === 'MARQUE' ? 'contact@marque.tn' : 'contact@agence.tn'" [attr.aria-label]="'E-mail de la ' + s.label.toLowerCase()" />
              <button class="send sm" type="submit" [disabled]="busy() || !email[s.kind].trim()">{{ busy() ? '…' : 'Inviter' }}</button>
              <button class="link" type="button" (click)="open.set(null)">Fermer</button>
            </form>
          }
          @if (shared()?.kind === s.kind) {
            <app-share-link class="full" [link]="shared()!.link" [email]="shared()!.email" subject="Invitation : {{ d().title }}"
              [message]="message(s.kind)" />
          }
        </li>
      }
    </ul>
    @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
    @if (ok()) { <p class="ok" role="status">{{ ok() }}</p> }
  </div>`,
  styles: [`
    .card { display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 14px; border: 1px solid var(--border); }
    .card h2 { margin: 0; font-size: 18px; }
    input:not([type=file]) { font: inherit; font-size: 14.5px; color: var(--text-primary); background: var(--bg-input, transparent);
      border: 1px solid var(--border); border-radius: 10px; padding: 0 12px; }
    input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .send { height: 40px; padding: 0 18px; border-radius: 10px; border: 0; background: var(--accent); color: #111; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; flex: none; }
    .link { border: 0; background: none; padding: 4px; color: var(--accent-ink); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .danger { color: var(--danger); }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .muted { color: var(--text-muted); margin: 0; font-size: 13.5px; }
    .ok { color: var(--success); margin: 0; } .err { color: var(--danger); margin: 0; }
    .invite { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
    .slots { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .slots li { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px; border-radius: 14px; border: 1px solid var(--border);
      background: var(--glass); transition: border-color .2s, background .2s; min-width: 0; }
    .slots li.ok { border-color: color-mix(in srgb, var(--vert-600, #2f9e6e) 50%, var(--border)); }
    .badge { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 14px;
      background: var(--bg-hover); color: var(--text-muted); }
    li.ok .badge { background: var(--vert-600, #2f9e6e); color: #fff; animation: pop .4s cubic-bezier(.2,.8,.2,1.3) both; }
    .who { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 2px; }
    .who small { font-size: 11.5px; color: var(--text-subtle); font-weight: 600; letter-spacing: .02em; }
    .who b { font-size: 14.5px; } .who .muted { font-size: 13px; }
    .acts { display: flex; gap: 12px; margin-top: 4px; }
    .mail { flex-basis: 100%; display: flex; gap: 8px; align-items: center; min-width: 0; animation: open .25s ease both; }
    .mail input { flex: 1; width: 0; min-width: 0; height: 40px; }
    .full { flex-basis: 100%; min-width: 0; }
    .send.sm { height: 36px; padding: 0 14px; font-size: 13.5px; }
    @keyframes pop { from { transform: scale(.4); opacity: 0; } }
    @keyframes open { from { opacity: 0; transform: translateY(-4px); } }
    @media (max-width: 560px) { .mail { flex-wrap: wrap; } .mail input { flex-basis: 100%; width: auto; } }
  `]
})
export class InviteCardComponent implements OnInit {
  private readonly api = inject(DemandeService);
  readonly d = input.required<DemandeDetail>();
  readonly changed = output<void>();

  readonly pending = signal<PendingInvitation[]>([]);
  readonly open = signal<Kind | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly ok = signal('');
  readonly shared = signal<{ kind: Kind; link: string; email: string } | null>(null);
  email: Record<Kind, string> = { MARQUE: '', AGENCE_MARKETING: '' };

  ngOnInit(): void { this.load(); }

  slots(): Slot[] {
    const x = this.d();
    return [
      { kind: 'MARQUE', label: 'Marque', joined: x.hasBrand ? x.brandName : null, hint: 'Elle rédige le brief dans le dossier du film, puis valide la recommandation.' },
      { kind: 'AGENCE_MARKETING', label: 'Agence marketing', joined: x.agencyName, hint: 'Elle reçoit le brief et rédige la recommandation créative.' }
    ];
  }

  pendingFor(kind: Kind): PendingInvitation | null { return this.pending().find(p => p.kind === kind) ?? null; }

  load(): void { this.api.invitations(this.d().id).subscribe({ next: l => this.pending.set(l), error: () => this.pending.set([]) }); }

  invite(kind: Kind): void {
    const mail = this.email[kind].trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(mail)) { this.error.set('Indiquez une adresse e-mail valide.'); return; }
    this.busy.set(true); this.error.set(''); this.ok.set('');
    this.api.invite(this.d().id, mail, kind).subscribe({
      next: r => {
        this.busy.set(false); this.open.set(null); this.email[kind] = '';
        if (r.status === 'LIEN' && r.token) { this.shared.set({ kind, link: ProductionService.link(r.token), email: mail }); this.load(); }
        else { this.shared.set(null); this.ok.set(r.message); this.changed.emit(); }
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Invitation impossible. Réessayez.'); }
    });
  }

  revoke(p: PendingInvitation): void {
    this.busy.set(true);
    this.api.revokeInvitation(p.id).subscribe({
      next: () => { this.busy.set(false); if (this.shared()?.kind === p.kind) this.shared.set(null); this.load(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Annulation impossible.'); }
    });
  }

  message(kind: Kind): string {
    const x = this.d(), prod = x.productionName ?? 'La production';
    return kind === 'MARQUE'
      ? `Bonjour, ${prod} vous invite sur Cercle pour le projet « ${x.title} ». Créez votre compte et rédigez votre brief dans le dossier du film :`
      : `Bonjour, ${prod} vous invite sur Cercle pour le projet « ${x.title} ». Vous y recevrez le brief de la marque pour rédiger votre recommandation créative :`;
  }

  day(ms: number): string { return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }); }
}
