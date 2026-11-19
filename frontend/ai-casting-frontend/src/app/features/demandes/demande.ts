import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { AgencyOption, DemandeDetail, DemandeRequest, DemandeService, DemandeStatus, DemandeVersion, STATUS_LABEL } from '../../core/services/demande.service';

/** Étapes affichées dans le suivi, dans l'ordre du cycle (cahier v2). */
const STEPS: { key: DemandeStatus[]; label: string }[] = [
  { key: ['BROUILLON'], label: 'Brouillon' },
  { key: ['V0_ENVOYEE'], label: 'V0 envoyée' },
  { key: ['V1_EN_COURS', 'V1_LIVREE'], label: 'V1 agence' },
  { key: ['V2_EN_COURS', 'V2_LIVREE'], label: 'V2 réalisateur' },
  { key: ['CASTING'], label: 'Casting' },
  { key: ['PPM'], label: 'PPM' },
  { key: ['ACTEURS_VALIDES', 'CLOTUREE'], label: 'Acteurs validés' }
];
const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.odt,.odp,.key,.pages,.txt,.rtf,.jpg,.jpeg,.png';

/**
 * Sprint 2 · T-158 / T-159 : une demande de publicité.
 * La marque la crée, écrit ou dépose sa V0 (fichier artistique, sans budget), choisit l'agence et l'envoie.
 * L'agence la lit en lecture seule. Le suivi montre l'étape en cours et le journal de la demande.
 */
@Component({
  selector: 'app-demande',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
  <section class="page">
    <a class="back" routerLink="/mes-demandes">← Mes demandes</a>

    @if (loading()) { <p class="muted">Chargement…</p> }
    @else if (fatal()) { <p class="err" role="alert">{{ fatal() }}</p> }
    @else {
      <header class="head">
        <h1>{{ d()?.title || 'Nouvelle demande de publicité' }}</h1>
        @if (d(); as x) {
          <p>{{ x.brandName }}{{ x.agencyName ? ' → ' + x.agencyName : '' }} · {{ statusLabel(x.status) }}</p>
        } @else {
          <p>Décrivez votre projet, puis déposez votre V0. Vous pourrez la modifier tant qu'elle n'est pas envoyée.</p>
        }
      </header>

      @if (d(); as x) {
        <ol class="steps" aria-label="Étapes de la demande">
          @for (s of steps; track s.label; let i = $index) {
            <li [class.done]="i < stepIndex()" [class.now]="i === stepIndex()" [attr.aria-current]="i === stepIndex() ? 'step' : null">
              <span class="dot" aria-hidden="true"></span>{{ s.label }}
            </li>
          }
        </ol>
        @if (x.status === 'ANNULEE') { <p class="note">Cette demande a été annulée.</p> }
      }

      @if (msg()) { <p class="ok" role="status">{{ msg() }}</p> }
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

      @if (editable()) {
        <form class="card" (ngSubmit)="save()" #f="ngForm">
          <h2>Le projet</h2>
          <label>Titre de la demande *<input name="title" [(ngModel)]="form.title" required maxlength="160" placeholder="Ex. Lancement printemps 2027"></label>
          <div class="two">
            <label>Produit ou service<input name="product" [(ngModel)]="form.product" maxlength="160"></label>
            <label>Date de diffusion souhaitée<input name="airDate" type="date" [(ngModel)]="form.airDate" [min]="today"></label>
          </div>
          <label>Objectif<textarea name="objective" [(ngModel)]="form.objective" rows="2" maxlength="2000" placeholder="Ce que la publicité doit faire : faire connaître, faire acheter…"></textarea></label>
          <label>Cible<textarea name="target" [(ngModel)]="form.target" rows="2" maxlength="2000" placeholder="À qui elle s'adresse"></textarea></label>
          <label>Message clé<textarea name="keyMessage" [(ngModel)]="form.keyMessage" rows="2" maxlength="2000"></textarea></label>
          <div class="row"><button class="send" type="submit" [disabled]="busy() || !form.title.trim()">{{ d() ? 'Enregistrer le projet' : 'Créer la demande' }}</button></div>
        </form>

        @if (d(); as x) {
          <div class="card">
            <h2>Votre V0</h2>
            <p class="muted">Le fichier artistique de votre idée : détails du projet, messages, notes, références. Pas de budget.</p>
            <label>Texte de la V0<textarea name="v0" [(ngModel)]="v0Text" rows="7" maxlength="20000" placeholder="Racontez votre idée de publicité…"></textarea></label>
            <div class="row"><button type="button" class="ghost" (click)="saveV0()" [disabled]="busy()">Enregistrer le texte</button></div>

            <div class="file">
              @if (v0()?.fileName) {
                <span>📎 {{ v0()!.fileName }} · {{ size(v0()!.fileSize) }}</span>
                <button type="button" class="link" (click)="download(v0()!)">Télécharger</button>
                <button type="button" class="link danger" (click)="removeFile()" [disabled]="busy()">Retirer</button>
              } @else {
                <label class="drop">
                  <input type="file" [accept]="accept" (change)="upload($event)" [disabled]="busy()">
                  <b>Déposer un fichier</b><span>PDF, Word, PowerPoint, Keynote, image… 20 Mo maximum</span>
                </label>
              }
            </div>
          </div>

          <div class="card">
            <h2>Envoyer à l'agence marketing</h2>
            @if (agencies().length) {
              <label>Agence<select name="agency" [(ngModel)]="agencyId">
                <option [ngValue]="null" disabled>Choisissez l'agence</option>
                @for (a of agencies(); track a.id) { <option [ngValue]="a.id">{{ a.name }}{{ a.city ? ' · ' + a.city : '' }}</option> }
              </select></label>
            } @else { <p class="muted">Aucune agence marketing n'est encore inscrite sur la plateforme.</p> }
            <p class="muted">Une fois envoyée, la V0 est figée et l'agence reçoit une notification.</p>
            <div class="row">
              <button type="button" class="send" (click)="send()" [disabled]="busy() || !agencyId || !hasV0()">Envoyer à l'agence</button>
              <button type="button" class="link danger" (click)="remove()" [disabled]="busy()">Supprimer le brouillon</button>
            </div>
            @if (!hasV0()) { <p class="hint">Écrivez votre V0 ou déposez un fichier avant d'envoyer.</p> }
          </div>
        }
      } @else if (d(); as x) {
        <div class="card">
          <h2>Le projet</h2>
          <dl>
            @if (x.product) { <dt>Produit</dt><dd>{{ x.product }}</dd> }
            @if (x.airDate) { <dt>Diffusion</dt><dd>{{ x.airDate | date:'d MMMM y' }}</dd> }
            @if (x.objective) { <dt>Objectif</dt><dd>{{ x.objective }}</dd> }
            @if (x.target) { <dt>Cible</dt><dd>{{ x.target }}</dd> }
            @if (x.keyMessage) { <dt>Message clé</dt><dd>{{ x.keyMessage }}</dd> }
            <dt>Créée par</dt><dd>{{ x.createdByName }} · {{ x.createdAt | date:'d MMM y' }}</dd>
          </dl>
        </div>
        @for (v of x.versions; track v.id) {
          <div class="card">
            <h2>{{ v.label }} <small>{{ v.status === 'LIVREE' ? 'livrée' : v.status === 'A_REVISER' ? 'à réviser' : 'brouillon' }}{{ v.deliveredAt ? ' le ' + (v.deliveredAt | date:'d MMM') : '' }}</small></h2>
            @if (v.body) { <p class="body">{{ v.body }}</p> }
            @if (v.fileName) {
              <div class="file"><span>📎 {{ v.fileName }} · {{ size(v.fileSize) }}</span>
                <button type="button" class="link" (click)="download(v)">Télécharger</button></div>
            }
          </div>
        }
        @if (x.status === 'V0_ENVOYEE' && isBrandSide()) {
          <div class="row"><button type="button" class="link danger" (click)="cancel()" [disabled]="busy()">Annuler la demande</button></div>
        }
      }

      @if (d()?.events?.length) {
        <div class="card">
          <h2>Journal</h2>
          <ul class="journal">
            @for (e of d()!.events; track $index) {
              <li><time>{{ e.createdAt | date:'d MMM, HH:mm' }}</time><span>{{ e.message }}@if (e.actorName && !e.message.includes(e.actorName)) { <em> · {{ e.actorName }}</em> }</span></li>
            }
          </ul>
        </div>
      }
    }
  </section>`,
  styles: [`
    :host { display: block; }
    .page { padding: 24px 32px 48px; max-width: 860px; display: flex; flex-direction: column; gap: 16px; }
    .back { color: var(--text-muted); text-decoration: none; font-size: 13.5px; }
    .back:hover { color: var(--text-primary); }
    .head h1 { font-size: 34px; line-height: 1.08; margin: 0; }
    .head p { margin: 6px 0 0; color: var(--text-muted); font-size: 14.5px; }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: var(--text-muted); }
    .steps li { display: flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--border); }
    .steps .done .dot { background: var(--accent); border-color: var(--accent); }
    .steps .now { color: var(--text-primary); font-weight: 700; }
    .steps .now .dot { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent); }
    .card { display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 14px; border: 1px solid var(--border); }
    .card h2 { margin: 0; font-size: 18px; }
    .card h2 small { font-size: 12.5px; font-weight: 500; color: var(--text-muted); margin-left: 6px; }
    label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-muted); }
    input:not([type=file]), textarea, select { font: inherit; font-size: 14.5px; font-weight: 400; color: var(--text-primary); background: var(--bg-input, transparent);
      border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    textarea { resize: vertical; line-height: 1.5; }
    input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .send { height: 40px; padding: 0 18px; border-radius: 10px; border: 0; background: var(--accent); color: #111; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
    .ghost { height: 38px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--border); background: transparent; color: var(--text-primary); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .link { border: 0; background: none; padding: 4px; color: var(--accent); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .danger { color: #e5484d; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    button:focus-visible { outline: 2px solid var(--text-primary); outline-offset: 2px; }
    .file { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; }
    .drop { flex: 1; flex-direction: column; align-items: flex-start; padding: 16px; border: 1px dashed var(--border); border-radius: 12px; cursor: pointer; position: relative; }
    .drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .drop b { color: var(--text-primary); font-size: 14px; }
    .drop span { font-weight: 400; }
    .drop:focus-within { outline: 2px solid var(--accent); }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 0; font-size: 14px; }
    dt { color: var(--text-muted); }
    dd { margin: 0; white-space: pre-wrap; }
    .body { white-space: pre-wrap; margin: 0; font-size: 14.5px; line-height: 1.55; }
    .journal { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; }
    .journal li { display: grid; grid-template-columns: 110px 1fr; gap: 10px; }
    .journal time { color: var(--text-muted); }
    .journal em { color: var(--text-muted); font-style: normal; }
    .muted, .hint { color: var(--text-muted); margin: 0; font-size: 13.5px; }
    .note { margin: 0; color: var(--text-muted); }
    .ok { color: #30a46c; margin: 0; }
    .err { color: #e5484d; margin: 0; }
    @media (max-width: 900px) { .page { padding: 18px 14px 104px; } .two { grid-template-columns: 1fr; } .head h1 { font-size: 28px; } }
  `]
})
export class DemandeComponent {
  private readonly api = inject(DemandeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly steps = STEPS;
  readonly accept = ACCEPT;
  readonly today = new Date().toISOString().slice(0, 10);
  readonly d = signal<DemandeDetail | null>(null);
  readonly agencies = signal<AgencyOption[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly fatal = signal('');
  readonly error = signal('');
  readonly msg = signal('');
  form: { title: string; product: string; objective: string; target: string; keyMessage: string; airDate: string } =
    { title: '', product: '', objective: '', target: '', keyMessage: '', airDate: '' };
  v0Text = '';
  agencyId: string | null = null;

  readonly editable = computed(() => !this.d() || this.d()!.canEdit);
  readonly v0 = computed(() => this.d()?.versions.find(v => v.kind === 'V0') ?? null);
  readonly hasV0 = computed(() => !!(this.v0()?.body?.trim() || this.v0()?.fileName));
  readonly stepIndex = computed(() => { const s = this.d()?.status; return s ? STEPS.findIndex(x => x.key.includes(s)) : 0; });
  private readonly auth = inject(AuthService);
  /** Annuler reste réservé à la marque ; le serveur le vérifie aussi. */
  readonly isBrandSide = computed(() => this.auth.role() === 'MARQUE' || this.auth.role() === 'ADMIN');

  constructor() {
    this.route.paramMap.subscribe(p => {
      const id = p.get('id');
      if (!id || id === 'nouvelle') { this.d.set(null); this.loading.set(false); this.loadAgencies(); return; }
      this.load(id);
    });
  }

  statusLabel(s: DemandeStatus) { return STATUS_LABEL[s]; }
  size(n: number | null) { if (!n) return ''; return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' Ko' : (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo'; }

  private load(id: string) {
    this.loading.set(true);
    this.api.get(id).subscribe({
      next: x => { this.apply(x); this.loading.set(false); if (x.canEdit) this.loadAgencies(); },
      error: (e: HttpErrorResponse) => { this.fatal.set(e.status === 404 ? 'Cette demande n’existe pas ou ne vous est pas visible.' : 'Impossible de charger la demande.'); this.loading.set(false); }
    });
  }
  private loadAgencies() { this.api.agencies().subscribe({ next: a => this.agencies.set(a), error: () => this.agencies.set([]) }); }

  private apply(x: DemandeDetail) {
    this.d.set(x);
    this.form = { title: x.title, product: x.product ?? '', objective: x.objective ?? '', target: x.target ?? '', keyMessage: x.keyMessage ?? '', airDate: x.airDate ?? '' };
    this.v0Text = x.versions.find(v => v.kind === 'V0')?.body ?? '';
    this.agencyId = x.agencyId ?? this.agencyId;
  }

  private run<T>(obs: import('rxjs').Observable<T>, ok: string, then?: (r: T) => void) {
    this.busy.set(true); this.error.set(''); this.msg.set('');
    obs.subscribe({
      next: r => { this.busy.set(false); this.msg.set(ok); then?.(r); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message || e.error?.error || 'L’opération a échoué. Réessayez.'); }
    });
  }

  private body(): DemandeRequest {
    const t = (s: string) => s.trim() || null;
    return { title: this.form.title.trim(), product: t(this.form.product), objective: t(this.form.objective), target: t(this.form.target),
      keyMessage: t(this.form.keyMessage), airDate: this.form.airDate || null };
  }

  save() {
    const x = this.d();
    if (!x) this.run(this.api.create(this.body()), 'Demande créée. Déposez maintenant votre V0.', r => { this.apply(r); this.router.navigate(['/demandes', r.id], { replaceUrl: true }); });
    else this.run(this.api.update(x.id, this.body()), 'Projet enregistré.', r => this.apply(r));
  }
  saveV0() { const x = this.d(); if (x) this.run(this.api.saveV0(x.id, this.v0Text), 'Texte de la V0 enregistré.', r => this.apply(r)); }
  upload(ev: Event) {
    const input = ev.target as HTMLInputElement; const file = input.files?.[0]; const x = this.d();
    if (!file || !x) return;
    if (file.size > 20 * 1024 * 1024) { this.error.set('Le fichier dépasse 20 Mo.'); input.value = ''; return; }
    this.run(this.api.uploadV0(x.id, file), 'Fichier déposé.', r => this.apply(r));
    input.value = '';
  }
  removeFile() { const x = this.d(); if (x) this.run(this.api.removeV0File(x.id), 'Fichier retiré.', r => this.apply(r)); }
  send() {
    const x = this.d(); if (!x || !this.agencyId) return;
    // le texte en cours est enregistré avant l'envoi, pour ne rien perdre
    const text = this.v0Text; const id = x.id; const ag = this.agencyId;
    const go = () => this.run(this.api.send(id, ag), 'Demande envoyée. L’agence a été notifiée.', r => this.apply(r));
    if ((this.v0()?.body ?? '') !== text) { this.busy.set(true); this.api.saveV0(id, text).subscribe({ next: () => go(), error: () => go() }); }
    else go();
  }
  cancel() { const x = this.d(); if (x) this.run(this.api.cancel(x.id), 'Demande annulée.', r => this.apply(r)); }
  remove() {
    const x = this.d(); if (!x) return;
    this.run(this.api.remove(x.id), 'Brouillon supprimé.', () => this.router.navigate(['/mes-demandes']));
  }
  download(v: DemandeVersion) {
    const x = this.d(); if (!x) return;
    this.api.file(x.id, v.id).subscribe({
      next: blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = v.fileName || 'v0'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); },
      error: () => this.error.set('Téléchargement impossible.')
    });
  }
}
