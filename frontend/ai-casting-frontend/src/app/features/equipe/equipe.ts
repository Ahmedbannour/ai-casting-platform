import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { BRAND_SWATCHES, Brand, BrandService } from '../../core/services/brand.service';
import { DropzoneComponent } from '../../shared/components/dropzone/dropzone';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Assistant, ProductionService } from '../../core/services/production.service';
import { PendingInvitation } from '../../core/services/demande.service';
import { PERMS } from '../../core/roles';
import { ShareLinkComponent } from '../../shared/components/share-link/share-link';

/**
 * Mon équipe (producer) : ses assistantes de production et ce qu'il leur autorise.
 * Chaque autorisation se coche d'un geste et s'applique tout de suite.
 */
@Component({
  selector: 'app-equipe',
  standalone: true,
  imports: [FormsModule, ShareLinkComponent, DropzoneComponent],
  template: `
  <section class="page">
    <header class="head">
      <h1>Mon équipe</h1>
      <p>Votre image de marque et vos assistantes de production. Ce que vous réglez ici s'applique à votre équipe, à vos rooms et aux invitations de vos projets.</p>
    </header>

    <section class="card brand-card" aria-labelledby="brand-t">
      <h2 id="brand-t">Votre image de marque</h2>
      <p class="muted">Vos invités (marque, agence, réalisateur) la voient dans vos rooms et sur vos invitations.</p>
      <div class="brand-grid">
        <div class="brand-form">
          <label for="b-name">Nom affiché</label>
          <input id="b-name" name="bname" [(ngModel)]="bName" maxlength="160" [placeholder]="orgName()" (input)="bDirty.set(true)" />
          <p class="lbl">Couleur principale</p>
          <div class="swatches" role="radiogroup" aria-label="Couleur principale">
            <button type="button" role="radio" class="sw cercle" [class.on]="!bColor()" [attr.aria-checked]="!bColor()" (click)="pick(null)" title="Couleurs Cercle"><span>Cercle</span></button>
            @for (c of swatches; track c) {
              <button type="button" role="radio" class="sw" [style.background]="c" [class.on]="bColor() === c" [attr.aria-checked]="bColor() === c" (click)="pick(c)" [attr.aria-label]="c"></button>
            }
          </div>
          <div class="hexrow">
            <span class="dot" [style.background]="bColor() || 'var(--crayon-400)'" aria-hidden="true"></span>
            <input name="bhex" [ngModel]="bColor() || ''" (ngModelChange)="typed($event)" maxlength="7" placeholder="#RRGGBB" aria-label="Couleur au format #RRGGBB" spellcheck="false" />
          </div>
          <p class="lbl">Logo</p>
          @if (brand.logoSrc(saved()); as src) {
            <div class="logo-row"><img class="brand-logo" [src]="src" alt="Logo actuel" />
              <button type="button" class="link danger" (click)="removeLogo()" [disabled]="bBusy()">Retirer le logo</button></div>
          } @else {
            <app-dropzone title="Déposer votre logo" accept="image/png,image/jpeg,image/webp" [formats]="['PNG', 'JPG', 'WebP']" [maxMb]="1"
                          icon="photo" [busy]="bBusy()" (file)="uploadLogo($event)" />
          }
          <div class="row">
            <button type="button" class="send" (click)="saveBrand()" [disabled]="bBusy() || !bDirty()">{{ bBusy() ? 'Enregistrement…' : 'Enregistrer' }}</button>
            @if (bDirty()) { <button type="button" class="link" (click)="resetBrand()">Annuler</button> }
          </div>
          @if (bMsg()) { <p class="ok" role="status">{{ bMsg() }}</p> }
        </div>
        <div class="preview" aria-hidden="true">
          <small>Aperçu</small>
          <div class="pv-side">
            <div class="pv-logo">
              @if (brand.logoSrc(saved()); as src) { <img class="brand-logo" [src]="src" alt="" /> } @else { <span class="brand-mark"></span> }
              <b>{{ bName.trim() || orgName() }}</b>
            </div>
            <span class="pv-btn">+ Nouveau projet</span>
            <span class="pv-item on">Projets</span>
            <span class="pv-item">Rooms</span>
          </div>
          <div class="pv-chips"><span class="pv-chip">Coup de cœur</span><span class="pv-tag">Room de casting</span></div>
        </div>
      </div>
    </section>

    <form class="card add" (ngSubmit)="invite()" (input)="error.set('')">
      <h2>Inviter une assistante</h2>
      <label for="as-mail">Son adresse e-mail</label>
      <input id="as-mail" name="mail" type="email" [(ngModel)]="mail" autocomplete="off" inputmode="email" placeholder="prenom@votreboite.tn" />
      <p class="lbl">Ce qu'elle peut faire</p>
      <div class="perms">
        @for (p of perms; track p.key) {
          <button type="button" class="perm" [class.on]="chosen().includes(p.key)" [attr.aria-pressed]="chosen().includes(p.key)" (click)="toggleNew(p.key)">
            <span class="tick" aria-hidden="true"></span><span><b>{{ p.label }}</b><small>{{ p.hint }}</small></span>
          </button>
        }
      </div>
      <div class="row">
        <button class="send" type="submit" [disabled]="busy() || !mail.trim()">{{ busy() ? 'Invitation…' : 'Créer le lien d’invitation' }}</button>
      </div>
      @if (link(); as l) {
        <app-share-link [link]="l.link" [email]="l.email" subject="Rejoignez notre équipe sur Cercle"
          message="Bonjour, je vous invite à rejoindre notre boîte de production sur Cercle comme assistante de production :" />
      }
    </form>

    @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

    @if (loading()) { <p class="muted">Chargement de l'équipe…</p> }
    @else {
      <h2 class="sec">Assistantes <span>{{ assistants().length }}</span></h2>
      @if (!assistants().length) {
        <p class="muted empty">Aucune assistante pour l'instant. Invitez-la ci-dessus : elle crée son compte en ouvrant le lien.</p>
      }
      <ul class="people">
        @for (a of assistants(); track a.id) {
          <li [class.off]="!a.enabled">
            <div class="top">
              <span class="av" aria-hidden="true">{{ initials(a.name) }}</span>
              <div class="id"><b>{{ a.name }}</b><small>{{ a.email }}{{ a.enabled ? '' : ' · désactivée' }}</small></div>
              <button type="button" class="link" [class.danger]="a.enabled" (click)="toggleEnabled(a)" [disabled]="saving() === a.id">
                {{ a.enabled ? 'Désactiver' : 'Réactiver' }}</button>
            </div>
            <div class="chips" role="group" [attr.aria-label]="'Autorisations de ' + a.name">
              @for (p of perms; track p.key) {
                <button type="button" class="chip" [class.on]="a.perms.includes(p.key)" [attr.aria-pressed]="a.perms.includes(p.key)"
                        [title]="p.hint" [disabled]="!a.enabled || saving() === a.id" (click)="togglePerm(a, p.key)">{{ p.label }}</button>
              }
            </div>
          </li>
        }
      </ul>

      @if (pending().length) {
        <h2 class="sec">Invitations en attente <span>{{ pending().length }}</span></h2>
        <ul class="pending">
          @for (p of pending(); track p.id) {
            <li><div><b>{{ p.email }}</b><small>{{ labels(p.perms) }} · lien valable jusqu'au {{ day(p.expiresAt) }}</small></div>
              <button type="button" class="link danger" (click)="revoke(p)">Annuler</button></li>
          }
        </ul>
      }
    }
  </section>`,
  styles: [`
    :host { display: block; }
    .page { padding: 24px 32px 48px; max-width: 860px; display: flex; flex-direction: column; gap: 18px; }
    .head h1 { font-size: 38px; line-height: 1.05; margin: 0; }
    .head p { margin: 6px 0 0; color: var(--text-muted); font-size: 14.5px; max-width: 62ch; line-height: 1.5; }
    .card { display: flex; flex-direction: column; gap: 10px; padding: 20px; border-radius: 16px; border: 1px solid var(--border); background: var(--glass); min-width: 0; }
    .card h2 { margin: 0 0 2px; font-size: 18px; }
    label, .lbl { font-size: 13px; font-weight: 600; color: var(--text-muted); margin: 4px 0 0; }
    input { height: 42px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-input, transparent); color: var(--text-primary); font: inherit; font-size: 14.5px; min-width: 0; }
    input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .perms { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr)); gap: 8px; }
    .perm { display: flex; gap: 10px; align-items: flex-start; text-align: left; padding: 11px 12px; border-radius: 12px; border: 1px solid var(--border);
      background: transparent; color: var(--text-primary); font: inherit; cursor: pointer; transition: border-color .15s, background .15s, transform .15s; }
    .perm:active { transform: scale(.98); }
    .perm b { display: block; font-size: 14px; } .perm small { display: block; color: var(--text-muted); font-size: 12.5px; line-height: 1.4; margin-top: 2px; }
    .perm.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
    .tick { flex: none; width: 18px; height: 18px; margin-top: 1px; border-radius: 6px; border: 1.5px solid var(--border); display: grid; place-items: center; transition: background .15s, border-color .15s; }
    .perm.on .tick { background: var(--accent); border-color: var(--accent); }
    .perm.on .tick::after { content: ''; width: 8px; height: 4px; border: solid var(--on-accent, #111); border-width: 0 0 2px 2px; transform: translateY(-1px) rotate(-45deg); animation: tick .2s ease both; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
    .send { height: 42px; padding: 0 18px; border-radius: 10px; border: 0; background: var(--accent); color: var(--on-accent, #111); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
    .link { border: 0; background: none; padding: 4px; color: var(--accent-ink); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; flex: none; }
    .danger { color: var(--danger); }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .sec { margin: 8px 0 0; font-size: 18px; display: flex; align-items: center; gap: 8px; }
    .sec span { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--bg-hover); color: var(--text-muted); }
    .people, .pending { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .people li { padding: 14px; border-radius: 16px; border: 1px solid var(--border); background: var(--glass); display: flex; flex-direction: column; gap: 12px;
      animation: rise .3s cubic-bezier(.2,.8,.2,1) both; transition: opacity .2s; }
    .people li.off { opacity: .6; }
    .top { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .av { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--crayon-500, var(--accent)); color: var(--graphite-900, #111); font-weight: 700; }
    .id { flex: 1; min-width: 0; } .id b { display: block; } .id small { display: block; color: var(--text-muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--text-muted);
      font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s, color .15s, border-color .15s, transform .15s; }
    .chip:active { transform: scale(.95); }
    .chip.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent, #111); }
    .pending li { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 1px dashed var(--border); }
    .pending li div { flex: 1; min-width: 0; } .pending b { display: block; font-size: 14px; } .pending small { color: var(--text-muted); font-size: 12.5px; }
    .muted { color: var(--text-muted); margin: 0; font-size: 14px; } .empty { padding: 4px 0; }
    .err { color: var(--danger); margin: 0; }
    .ok { color: var(--success); margin: 0; font-size: 14px; }
    .brand-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 260px); gap: 20px; align-items: start; }
    .brand-form { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .swatches { display: flex; flex-wrap: wrap; gap: 8px; }
    .sw { width: 34px; height: 34px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15);
      transition: transform .15s, box-shadow .15s; }
    .sw:hover { transform: scale(1.08); }
    .sw.on { box-shadow: 0 0 0 2px var(--bg-primary), 0 0 0 4px var(--text-primary); }
    .sw.cercle { width: auto; padding: 0 12px; border-radius: 999px; background: var(--crayon-400); color: var(--graphite-900); font: inherit; font-size: 12.5px; font-weight: 700; }
    .hexrow { display: flex; align-items: center; gap: 8px; }
    .hexrow .dot { width: 22px; height: 22px; border-radius: 50%; flex: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,.2); }
    .hexrow input { width: 130px; font-variant-numeric: tabular-nums; text-transform: uppercase; }
    .logo-row { display: flex; align-items: center; gap: 12px; }
    .logo-row img { width: 56px; height: 56px; border-radius: 12px; background: var(--bg-surface); border: 1px solid var(--border); }
    .preview { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 14px; border: 1px dashed var(--border); }
    .preview small { color: var(--text-subtle); font-size: 12px; font-weight: 600; }
    .pv-side { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 12px; background: var(--bg-surface); }
    .pv-logo { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; min-width: 0; }
    .pv-logo img, .pv-logo .brand-mark { width: 26px; height: 26px; border-radius: 7px; object-fit: contain; flex: none; }
    .pv-logo b { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pv-btn { display: block; text-align: center; padding: 8px; border-radius: 10px; background: var(--accent); color: var(--on-accent); font-size: 13px; font-weight: 700; transition: background .25s, color .25s; }
    .pv-item { padding: 7px 10px; border-radius: 8px; font-size: 13px; color: var(--text-muted); }
    .pv-item.on { background: var(--accent-dim); color: var(--text-primary); font-weight: 600; box-shadow: inset 3px 0 0 var(--accent); }
    .pv-chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .pv-chip { padding: 5px 10px; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-size: 12px; font-weight: 700; }
    .pv-tag { padding: 5px 10px; border-radius: 999px; color: var(--accent-ink); border: 1px solid var(--accent); font-size: 12px; font-weight: 700; }
    @media (max-width: 760px) { .brand-grid { grid-template-columns: 1fr; } }
    @keyframes rise { from { opacity: 0; transform: translateY(8px); } }
    @keyframes tick { from { opacity: 0; transform: translateY(-1px) rotate(-45deg) scale(.4); } }
    @media (max-width: 860px) { .page { padding: 16px 16px 40px; } .head h1 { font-size: 30px; } }
    @media (prefers-reduced-motion: reduce) { .people li { animation: none; } }
  `]
})
export class EquipeComponent implements OnInit, OnDestroy {
  private readonly api = inject(ProductionService);
  readonly perms = PERMS;

  readonly loading = signal(true);
  readonly assistants = signal<Assistant[]>([]);
  readonly pending = signal<PendingInvitation[]>([]);
  readonly chosen = signal<string[]>(['PROJETS', 'INVITATIONS']);
  readonly busy = signal(false);
  readonly saving = signal<string | null>(null);
  readonly error = signal('');
  readonly link = signal<{ link: string; email: string } | null>(null);
  mail = '';

  ngOnInit(): void {
    this.load();
    this.brand.mine().subscribe({ next: b => this.applySaved(b), error: () => {} });
  }
  ngOnDestroy(): void { this.brand.restore(); }   // un aperçu non enregistré s'efface en quittant la page

  // ── Image de marque ──
  readonly brand = inject(BrandService);
  readonly swatches = BRAND_SWATCHES;
  readonly saved = signal<Brand | null>(null);
  readonly orgName = signal('Votre boîte');
  readonly bColor = signal<string | null>(null);
  readonly bBusy = signal(false);
  readonly bDirty = signal(false);
  readonly bMsg = signal('');
  bName = '';

  private applySaved(b: Brand): void {
    this.saved.set(b); this.orgName.set(b.name); this.bName = b.name; this.bColor.set(b.color); this.bDirty.set(false);
  }
  pick(c: string | null): void { this.bColor.set(c); this.brand.preview(c); this.bDirty.set(true); this.bMsg.set(''); }
  typed(v: string): void {
    const h = (v || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(h)) this.pick(h.toUpperCase());
    else if (!h) this.pick(null);
  }
  resetBrand(): void { const b = this.saved(); if (b) this.applySaved(b); this.brand.restore(); }
  saveBrand(): void {
    this.bBusy.set(true); this.error.set('');
    const name = this.bName.trim() || null;
    this.brand.save(name, this.bColor()).subscribe({
      next: b => { this.bBusy.set(false); this.applySaved(b); this.bMsg.set('Image de marque enregistrée : votre équipe et vos invités la voient déjà.'); },
      error: e => { this.bBusy.set(false); this.error.set(e.error?.message ?? 'Enregistrement impossible.'); }
    });
  }
  uploadLogo(f: File): void {
    this.bBusy.set(true); this.error.set('');
    this.brand.uploadLogo(f).subscribe({
      next: b => { this.bBusy.set(false); this.saved.set(b); this.bMsg.set('Logo enregistré.'); if (this.bDirty()) this.brand.preview(this.bColor()); },
      error: e => { this.bBusy.set(false); this.error.set(e.error?.message ?? 'Envoi du logo impossible.'); }
    });
  }
  removeLogo(): void {
    this.bBusy.set(true);
    this.brand.removeLogo().subscribe({ next: b => { this.bBusy.set(false); this.saved.set(b); if (this.bDirty()) this.brand.preview(this.bColor()); },
      error: () => this.bBusy.set(false) });
  }

  load(): void {
    this.api.team().subscribe({
      next: t => { this.assistants.set(t.assistants); this.pending.set(t.pending); this.loading.set(false); },
      error: (e: HttpErrorResponse) => { this.loading.set(false); this.error.set(e.error?.message ?? 'Équipe indisponible pour le moment.'); }
    });
  }

  toggleNew(key: string): void {
    this.chosen.update(l => l.includes(key) ? l.filter(k => k !== key) : [...l, key]);
  }

  invite(): void {
    const m = this.mail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(m)) { this.error.set('Indiquez une adresse e-mail valide.'); return; }
    this.busy.set(true); this.error.set('');
    this.api.inviteAssistant(m, this.chosen()).subscribe({
      next: r => { this.busy.set(false); this.mail = ''; if (r.token) this.link.set({ link: ProductionService.link(r.token), email: m }); this.load(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message ?? 'Invitation impossible. Réessayez.'); }
    });
  }

  togglePerm(a: Assistant, key: string): void {
    const perms = a.perms.includes(key) ? a.perms.filter(k => k !== key) : [...a.perms, key];
    this.assistants.update(l => l.map(x => x.id === a.id ? { ...x, perms } : x));   // tout de suite à l'écran
    this.save(a, { perms });
  }

  toggleEnabled(a: Assistant): void { this.save(a, { enabled: !a.enabled }); }

  private save(a: Assistant, body: { perms?: string[]; enabled?: boolean }): void {
    this.saving.set(a.id); this.error.set('');
    this.api.updateAssistant(a.id, body).subscribe({
      next: u => { this.saving.set(null); this.assistants.update(l => l.map(x => x.id === u.id ? u : x)); },
      error: (e: HttpErrorResponse) => { this.saving.set(null); this.error.set(e.error?.message ?? 'Enregistrement impossible.'); this.load(); }
    });
  }

  revoke(p: PendingInvitation): void {
    this.api.revoke(p.id).subscribe({ next: () => this.load(), error: (e: HttpErrorResponse) => this.error.set(e.error?.message ?? 'Annulation impossible.') });
  }

  labels(keys: string[]): string {
    const l = PERMS.filter(p => keys.includes(p.key)).map(p => p.label);
    return l.length ? l.join(', ') : 'Aucune autorisation';
  }
  initials(n: string): string { return n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase(); }
  day(ms: number): string { return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }); }
}
