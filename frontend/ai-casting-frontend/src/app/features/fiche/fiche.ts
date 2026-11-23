import { AfterViewChecked, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { LiveService } from '../../core/services/live.service';
import { PageRailComponent } from '../../shared/components/page-rail/page-rail';
import { DropzoneComponent } from '../../shared/components/dropzone/dropzone';
import { DateFieldComponent } from '../../shared/components/date-field/date-field';
import { FicheService, Sheet, SheetField, SheetSource, SheetStage } from './fiche.service';

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/**
 * P-083 · La fiche unique du projet, lue comme un article : l'état des lieux en tête, puis les sept étapes
 * qui apparaissent au défilement. Chacun modifie ses étapes ; un document déposé est lu par l'IA,
 * qui remplit les étapes de l'auteur et prépare des propositions pour les autres.
 */
@Component({
  selector: 'app-fiche',
  standalone: true,
  imports: [FormsModule, PageRailComponent, DropzoneComponent, DateFieldComponent],
  template: `
  <div class="sheet">
  <article class="doc" #doc aria-label="Fiche du projet">
    @if (error() && !sheet()) { <p class="err" role="alert">{{ error() }}</p> }
    @if (!sheet() && !error()) { <div class="skel hero-sk" aria-hidden="true"></div><div class="skel" aria-hidden="true"></div> }
    @if (sheet(); as s) {
      <!-- État des lieux -->
      <header class="hero reveal" data-rail data-rail-label="État des lieux" id="etat-des-lieux">
        <p class="kicker">Fiche du projet{{ s.brandName ? ' · ' + s.brandName : '' }}</p>
        <h2 class="h-title">{{ s.title }}</h2>
        <div class="state">
          <div class="pct" aria-label="Fiche remplie à {{ s.progress }} %"><b>{{ shown() }}</b><span>%</span></div>
          <div class="state-txt">
            <p class="lead">{{ s.stagesDone }} étape{{ s.stagesDone > 1 ? 's' : '' }} complète{{ s.stagesDone > 1 ? 's' : '' }} sur {{ s.stagesTotal }}.
              @if (handStage(); as h) { La suite : <a [href]="'#etape-' + h.key" (click)="jump($event, h.key)">{{ pad(h.num) }} · {{ h.title }}</a>, {{ h.canEdit ? 'à vous de la remplir' : 'à remplir par ' + by(h.owner) }}. }
              @else { La fiche est complète. }</p>
            @if (myStages().length) {
              <p class="mine-line">Vos étapes :
                @for (m of myStages(); track m.key) { <a class="chip" [class.todo]="m.state !== 'complete'" [href]="'#etape-' + m.key" (click)="jump($event, m.key)">{{ pad(m.num) }} {{ m.title }}@if (m.suggestions) { <i>{{ m.suggestions }} proposition{{ m.suggestions > 1 ? 's' : '' }}</i> }</a> }
              </p>
            } @else { <p class="mine-line">Vous lisez cette fiche ; chaque étape est remplie par son équipe.</p> }
          </div>
        </div>
        <!-- Le déroulé, comme les étapes d'un build -->
        <ol class="pipe" aria-label="Avancement par étape">
          @for (st of s.stages; track st.key; let i = $index) {
            <li [attr.data-s]="st.state" [style.--d]="i">
              <a [href]="'#etape-' + st.key" (click)="jump($event, st.key)" [attr.aria-label]="pad(st.num) + ' ' + st.title + ' : ' + stateLabel(st.state)">
                <span class="seg"><b [style.width.%]="st.total ? st.filled / st.total * 100 : 0"></b></span>
                <span class="n">{{ pad(st.num) }}</span>
              </a>
            </li>
          }
        </ol>
      </header>

      <!-- Déposer un document : l'IA remplit -->
      @if (s.canUpload) {
        <section class="feed reveal" data-rail data-rail-label="Remplir avec l'IA" id="remplir-ia" aria-labelledby="feed-h">
          <h2 id="feed-h">Remplir avec l'IA</h2>
          <p class="muted">Déposez votre brief, votre présentation ou collez un lien Canva : l'IA lit le document, remplit vos étapes et prépare des propositions pour les autres. Chacun n'a plus qu'à vérifier.</p>
          <div class="feed-row">
            <app-dropzone title="Déposer un document" [accept]="formats" [formats]="['PDF', 'Word', 'PowerPoint', 'texte']" [maxMb]="25" [busy]="uploading()" busyText="Envoi…" (file)="upload($event)" />
            <form class="link" (ngSubmit)="sendLink()">
              <label for="fiche-link">Ou un lien (Canva, page web)</label>
              <div class="link-row">
                <input id="fiche-link" name="link" type="url" inputmode="url" [(ngModel)]="linkUrl" placeholder="https://www.canva.com/design/…/view" [attr.aria-describedby]="linkErr() ? 'link-err' : null" />
                <button type="submit" class="go" [disabled]="uploading() || !linkUrl.trim()">Lire</button>
              </div>
              @if (linkErr()) { <p class="field-msg" id="link-err" role="alert">{{ linkErr() }}</p> }
            </form>
          </div>
          @if (s.sources.length) {
            <ul class="sources" aria-label="Documents lus">
              @for (src of s.sources.slice(0, 4); track src.id) {
                <li [attr.data-st]="src.status">
                  <span class="src-ic" aria-hidden="true">{{ src.kind === 'LIEN' ? '↗' : '▤' }}</span>
                  <div class="src-txt">
                    <b>{{ src.name }}</b>
                    <span>@switch (src.status) {
                      @case ('LECTURE') { L'IA lit le document<i class="dots" aria-hidden="true"><i></i><i></i><i></i></i> }
                      @case ('FAIT') { {{ resultLine(src) }} }
                      @default { Lecture impossible }
                    } · {{ src.addedBy }}, {{ ago(src.createdAt) }}</span>
                    @if (src.message) { <small>{{ src.message }}</small> }
                  </div>
                </li>
              }
            </ul>
          }
        </section>
      }

      @if (msg()) { <p class="ok" role="status">{{ msg() }}</p> }
      @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

      <!-- Les étapes -->
      <div class="stages">
        @for (st of s.stages; track st.key) {
          <section class="stage reveal" [id]="'etape-' + st.key" data-rail [attr.data-rail-state]="st.mine && st.state !== 'complete' ? 'tour' : st.state"
                   [attr.data-rail-label]="st.title" [class.mine]="st.mine" [attr.data-s]="st.state" [attr.aria-labelledby]="'h-' + st.key">
            <div class="st-head">
              <span class="num" aria-hidden="true">{{ pad(st.num) }}</span>
              <div class="st-ttl">
                <h2 [id]="'h-' + st.key">{{ st.title }}</h2>
                <p class="by">
                  <span class="owner">{{ st.canEdit ? 'Votre étape' : 'Remplie par ' + by(st.owner) }}</span>
                  <span class="badge" [attr.data-s]="st.state">{{ stateLabel(st.state) }}{{ st.total && st.state !== 'complete' ? ' · ' + st.filled + '/' + st.total : '' }}</span>
                  @if (st.updatedBy) { <span class="when">{{ st.updatedBy }}, {{ ago(st.updatedAt!) }}</span> }
                </p>
              </div>
            </div>
            <p class="intro">{{ st.intro }}</p>

            @if (st.fields.length) {
              <dl class="fields">
                @for (f of st.fields; track f.key) {
                  <div class="f" [class.wide]="f.kind === 'LONG'" [class.empty]="!f.value" [class.editing]="editing() === f.key">
                    <dt>{{ f.label }}@if (!f.required) { <small> · facultatif</small> }</dt>
                    <dd>
                      @if (editing() === f.key) {
                        <form class="edit" (ngSubmit)="save(f)">
                          @if (f.kind === 'DATE') { <app-date-field name="v" [(ngModel)]="draft" /> }
                          @else if (f.kind === 'LONG') { <textarea name="v" rows="4" maxlength="4000" [(ngModel)]="draft" [placeholder]="f.hint" [attr.aria-label]="f.label"></textarea> }
                          @else { <input name="v" maxlength="300" [(ngModel)]="draft" [placeholder]="f.hint" [attr.aria-label]="f.label" /> }
                          <div class="edit-actions">
                            <button type="submit" class="go" [disabled]="busy()">Enregistrer</button>
                            <button type="button" class="ghost" (click)="cancel()">Annuler</button>
                          </div>
                        </form>
                      } @else {
                        @if (f.value) {
                          <p class="val">{{ f.kind === 'DATE' ? dateFr(f.value) : f.value }}</p>
                          @if (f.source === 'IA') { <span class="ai-tag" title="Rempli par l'IA à partir d'un document">✦ Rempli par l'IA{{ f.canEdit ? ' · à vérifier' : '' }}</span> }
                        } @else {
                          <p class="val none">{{ f.canEdit ? f.hint : 'À remplir par ' + by(st.owner) }}</p>
                        }
                        @if (f.canEdit && !(f.suggestion && !f.value)) { <button type="button" class="edit-btn" (click)="edit(f)" [attr.aria-label]="(f.value ? 'Modifier ' : 'Remplir ') + f.label">{{ f.value ? 'Modifier' : 'Remplir' }}</button> }
                      }
                      @if (f.suggestion && editing() !== f.key) {
                        @if (f.canEdit) {
                          <div class="sugg" role="group" [attr.aria-label]="'Proposition de l\\'IA pour ' + f.label">
                            <p><span class="ai-tag">✦ L'IA propose{{ f.suggestionFrom ? ', d\\'après le document de ' + f.suggestionFrom : '' }}</span>{{ f.kind === 'DATE' ? dateFr(f.suggestion) : f.suggestion }}</p>
                            <div class="sugg-actions">
                              <button type="button" class="go" [disabled]="busy()" (click)="accept(f)">Accepter</button>
                              <button type="button" class="ghost" [disabled]="busy()" (click)="edit(f, f.suggestion)">Corriger</button>
                              <button type="button" class="ghost" [disabled]="busy()" (click)="reject(f)">Écarter</button>
                            </div>
                          </div>
                        } @else {
                          <p class="pending">✦ Une proposition de l'IA attend {{ by(st.owner) }}.</p>
                        }
                      }
                    </dd>
                  </div>
                }
              </dl>
            } @else {
              @if (st.lines.length) {
                <ul class="lines">
                  @for (l of st.lines; track $index) { <li><b>{{ l.title }}</b><span>{{ l.detail }}</span></li> }
                </ul>
              } @else {
                <p class="val none">{{ st.key === 'roles' ? 'Les rôles apparaîtront ici quand la réalisation aura écrit la V2.' : 'Le casting commence quand la room est ouverte.' }}</p>
              }
            }
          </section>
        }
      </div>
    }
  </article>
  @if (sheet()) { <app-page-rail class="rail-col" [root]="doc" /> }
  </div>
  `,
  styleUrl: './fiche.scss'
})
export class FicheComponent implements AfterViewChecked {
  private readonly api = inject(FicheService);
  private readonly host = inject(ElementRef<HTMLElement>);
  /** Une des deux : la demande (page projet) ou la room. */
  readonly requestId = input<string | null>(null);
  readonly roomId = input<string | null>(null);

  readonly sheet = signal<Sheet | null>(null);
  readonly error = signal('');
  readonly msg = signal('');
  readonly linkErr = signal('');
  readonly busy = signal(false);
  readonly uploading = signal(false);
  readonly editing = signal<string | null>(null);
  readonly shown = signal(0);
  readonly formats = '.pdf,.docx,.pptx,.txt,.rtf';
  draft = '';
  linkUrl = '';
  private io: IntersectionObserver | null = null;
  private poll: ReturnType<typeof setTimeout> | null = null;

  readonly handStage = computed(() => { const s = this.sheet(); return s?.stages.find(x => x.key === s.handStage) ?? null; });
  readonly myStages = computed(() => this.sheet()?.stages.filter(x => x.canEdit) ?? []);

  constructor() {
    effect(() => { this.requestId(); this.roomId(); untracked(() => this.load()); });
    inject(LiveService).watch(inject(DestroyRef), () => this.load(true), () => this.editing() !== null || this.busy());
    inject(DestroyRef).onDestroy(() => { this.io?.disconnect(); if (this.poll) clearTimeout(this.poll); });
  }

  /** Révèle chaque bloc quand il entre à l'écran (une seule fois). */
  ngAfterViewChecked(): void {
    const els = this.host.nativeElement.querySelectorAll('.reveal:not(.seen)') as NodeListOf<HTMLElement>;
    if (!els.length) return;
    if (!this.io) {
      if (typeof IntersectionObserver === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach(e => e.classList.add('seen', 'in')); return; }
      this.io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); this.io!.unobserve(e.target); } }), { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    }
    els.forEach(e => { e.classList.add('seen'); this.io!.observe(e); });
  }

  load(silent = false): void {
    const r = this.requestId(), room = this.roomId();
    if (!r && !room) return;
    (room ? this.api.forRoom(room) : this.api.forRequest(r!)).subscribe({
      next: s => this.apply(s),
      error: (e: HttpErrorResponse) => { if (!silent) this.error.set(e.status === 404 ? 'Cette fiche n’existe pas ou ne vous est pas visible.' : 'Impossible de charger la fiche.'); }
    });
  }

  private apply(s: Sheet): void {
    const first = !this.sheet();
    const before = this.sheet()?.progress ?? 0;
    this.sheet.set(s); this.error.set('');
    // Arrivée depuis une notification (#etape-concept) : on va à l'étape
    if (first && location.hash.startsWith('#etape-')) { const k = location.hash.slice(7); setTimeout(() => this.jump(new Event('x'), k), 500); }
    this.count(before, s.progress);
    // Un document est en cours de lecture : on revient voir toutes les 3 s (en plus des mises à jour en direct)
    if (this.poll) clearTimeout(this.poll);
    if (s.sources.some(x => x.status === 'LECTURE')) this.poll = setTimeout(() => this.load(true), 3000);
  }

  /** Le pourcentage monte doucement jusqu'à sa valeur. */
  private count(from: number, to: number): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) { this.shown.set(to); return; }
    const t0 = performance.now(), d = 900;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
      this.shown.set(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  edit(f: SheetField, preset?: string | null): void { this.editing.set(f.key); this.draft = preset ?? f.value ?? ''; this.msg.set(''); this.error.set('');
    setTimeout(() => (this.host.nativeElement.querySelector('.edit textarea, .edit input') as HTMLElement | null)?.focus()); }
  cancel(): void { this.editing.set(null); }

  save(f: SheetField): void {
    const s = this.sheet(); if (!s) return;
    this.run(this.api.save(s.requestId, f.key, this.draft), `${f.label} : enregistré.`, () => this.editing.set(null));
  }
  accept(f: SheetField): void { const s = this.sheet(); if (s) this.run(this.api.accept(s.requestId, f.key), `${f.label} : proposition acceptée.`); }
  reject(f: SheetField): void { const s = this.sheet(); if (s) this.run(this.api.reject(s.requestId, f.key), `${f.label} : proposition écartée.`); }

  upload(file: File): void {
    const s = this.sheet(); if (!s) return;
    this.uploading.set(true); this.linkErr.set(''); this.error.set('');
    this.api.upload(s.requestId, file).subscribe({
      next: x => { this.uploading.set(false); this.apply(x); this.msg.set(`« ${file.name} » déposé : l'IA le lit.`); },
      error: (e: HttpErrorResponse) => { this.uploading.set(false); this.error.set(e.error?.message || 'Le document n’a pas pu être envoyé.'); }
    });
  }

  sendLink(): void {
    const s = this.sheet(); const u = this.linkUrl.trim(); if (!s || !u) return;
    this.uploading.set(true); this.linkErr.set('');
    this.api.link(s.requestId, u).subscribe({
      next: x => { this.uploading.set(false); this.linkUrl = ''; this.apply(x); this.msg.set('Lien déposé : l’IA le lit.'); },
      error: (e: HttpErrorResponse) => { this.uploading.set(false); this.linkErr.set(e.error?.message || 'Ce lien n’a pas pu être lu.'); }
    });
  }

  private run(obs: import('rxjs').Observable<Sheet>, ok: string, then?: () => void): void {
    this.busy.set(true); this.error.set(''); this.msg.set('');
    obs.subscribe({
      next: s => { this.busy.set(false); this.apply(s); this.msg.set(ok); then?.(); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.error.set(e.error?.message || 'L’enregistrement a échoué. Réessayez.'); }
    });
  }

  jump(e: Event, key: string): void {
    e.preventDefault();
    const el = this.host.nativeElement.querySelector('#etape-' + key) as HTMLElement | null;
    el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    (el?.querySelector('h2') as HTMLElement | null)?.setAttribute('tabindex', '-1');
    (el?.querySelector('h2') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  resultLine(src: SheetSource): string {
    if (!src.filled && !src.proposed) return 'Rien à reprendre';
    const parts: string[] = [];
    if (src.filled) parts.push(`${src.filled} champ${src.filled > 1 ? 's' : ''} rempli${src.filled > 1 ? 's' : ''}`);
    if (src.proposed) parts.push(`${src.proposed} proposition${src.proposed > 1 ? 's' : ''} envoyée${src.proposed > 1 ? 's' : ''}`);
    return parts.join(', ') + (src.engine === 'REGLES' ? ' (sans IA)' : '');
  }

  stateLabel(s: SheetStage['state']): string { return s === 'complete' ? 'Complète' : s === 'encours' ? 'En cours' : 'À remplir'; }
  /** « par le producer », « par la marque »… */
  by(owner: string): string {
    const m: Record<string, string> = { 'Producer': 'le producer', 'Marque': 'la marque', 'Agence marketing': 'l’agence marketing', 'Réalisation': 'la réalisation', 'Toute l\'équipe': 'toute l’équipe' };
    return m[owner] ?? owner.toLowerCase();
  }
  pad(n: number): string { return String(n).padStart(2, '0'); }
  dateFr(iso: string): string { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : iso; }
  ago(iso: string): string {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
    return this.dateFr(iso);
  }
}
