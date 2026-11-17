import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { PublicCandidate, PublicShare, ShareService, VOTE_LABEL, Vote } from '../../core/services/share.service';
import { frDate } from '../../shared/forms/dates';

const NAME_KEY = 'casting_voter_name';

/** Page du réalisateur, ouverte par lien et sans compte : il donne son avis sur chaque candidat. */
@Component({
  selector: 'app-director-share',
  standalone: true,
  imports: [FormsModule],
  template: `
  <main class="page">
    @if (share(); as s) {
      <header class="head">
        <p class="from">{{ s.projectTitle }}</p>
        <h1>{{ s.roleName }}</h1>
        @if (s.criteria) { <p class="crit">{{ s.criteria }}</p> }
        @if (s.roleDescription) { <p class="desc">{{ s.roleDescription }}</p> }
        <p class="facts">
          @if (s.shootStart) { <span>Tournage du {{ frDate(s.shootStart) }}@if (s.shootEnd) { au {{ frDate(s.shootEnd) }} }</span> }
          <span>Lien valable jusqu'au {{ frDate(s.expiresAt.slice(0, 10)) }}</span>
        </p>
      </header>

      <section class="me" aria-labelledby="me-t">
        <div class="me-text">
          <h2 id="me-t">Votre avis</h2>
          <p>Pour chaque candidat, répondez oui, peut-être ou non. L'agence voit vos réponses en direct. Vous pouvez changer d'avis tant que le lien est valable.</p>
        </div>
        <div class="f">
          <label for="voter">Votre nom</label>
          <input id="voter" [(ngModel)]="voterName" (blur)="rememberName()" maxlength="80" placeholder="Ex. Claire Martin" autocomplete="name"
                 [attr.aria-invalid]="nameMissing() ? 'true' : null" />
          @if (nameMissing()) { <span class="field-msg">Indiquez votre nom avant de donner un avis.</span> }
        </div>
        <div class="progress" aria-live="polite">
          <b>{{ answered() }}</b> sur {{ s.candidates.length }} candidats
          <span class="bar"><span [style.width.%]="s.candidates.length ? answered() / s.candidates.length * 100 : 0"></span></span>
        </div>
      </section>

      <div class="list">
        @for (c of s.candidates; track c.entryId) {
          <article class="cand" [attr.data-v]="c.vote">
            <div class="photo">
              @if (c.photoUrl && !broken().has(c.photoUrl)) { <img [src]="c.photoUrl" [alt]="'Photo de ' + c.firstName + ' ' + c.lastName" (error)="markBroken(c.photoUrl)" loading="lazy" /> }
              @else { <span class="init">{{ (c.firstName[0] || '') + (c.lastName[0] || '') }}</span> }
            </div>
            <div class="body">
              <h3>{{ c.firstName }} {{ c.lastName }}</h3>
              <p class="sub">{{ facts(c) }}</p>
              @if (c.bio) { <p class="bio">{{ c.bio }}</p> }
              @if (c.languages.length || c.skills.length) {
                <ul class="tags">
                  @for (l of c.languages; track l) { <li>{{ l }}</li> }
                  @for (k of c.skills; track k) { <li class="k">{{ k }}</li> }
                </ul>
              }
              @if (c.experiences.length) {
                <ul class="exp">@for (x of c.experiences; track x) { <li>{{ x }}</li> }</ul>
              }
              <div class="vote" role="radiogroup" [attr.aria-label]="'Votre avis sur ' + c.firstName + ' ' + c.lastName">
                @for (v of choices; track v) {
                  <button type="button" role="radio" [attr.aria-checked]="c.vote === v" [attr.data-c]="v"
                          [disabled]="saving() === c.entryId" (click)="vote(c, v)">{{ label[v] }}</button>
                }
              </div>
              <textarea [(ngModel)]="c.comment" (blur)="c.vote && saveComment(c)" rows="2" maxlength="1000"
                        [attr.aria-label]="'Commentaire sur ' + c.firstName" placeholder="Un mot pour l'agence (facultatif)"></textarea>
              @if (errorFor() === c.entryId) { <p class="field-msg" role="alert">{{ error() }}</p> }
              @if (savedFor() === c.entryId) { <p class="saved" role="status">Avis enregistré</p> }
            </div>
          </article>
        } @empty {
          <p class="none">L'agence n'a pas encore ajouté de candidat à cette sélection.</p>
        }
      </div>
      <p class="foot">Les coordonnées des candidats restent chez l'agence. Pour les contacter, passez par elle.</p>
    } @else if (gone()) {
      <div class="state">
        <h1>Ce lien n'est plus valable</h1>
        <p>Il a expiré ou l'agence l'a retiré. Demandez-lui un nouveau lien.</p>
      </div>
    } @else if (missing()) {
      <div class="state">
        <h1>Lien introuvable</h1>
        <p>Vérifiez que l'adresse est complète, ou demandez à l'agence de vous la renvoyer.</p>
      </div>
    } @else {
      <div class="skel"></div>
    }
  </main>
  `,
  styles: [`
  :host { display: block; min-height: 100vh; }
  .page { max-width: 920px; margin: 0 auto; padding: 40px 24px 64px; display: flex; flex-direction: column; gap: 20px; }
  .from { color: var(--text-muted); font-size: 15px; }
  h1 { font-size: clamp(36px, 6vw, 60px); line-height: 1; margin-top: 4px; }
  .crit { margin-top: 12px; font-size: 17px; }
  .desc { margin-top: 8px; color: var(--text-muted); max-width: 64ch; line-height: 1.6; }
  .facts { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13.5px; color: var(--text-muted); }
  .me { display: grid; grid-template-columns: 1fr 260px; gap: 16px 24px; align-items: end; padding: 20px; border-radius: var(--radius-l);
    border: 1px solid var(--border); background: var(--glass); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }
  .me h2 { font-size: 20px; }
  .me p { margin-top: 6px; color: var(--text-muted); font-size: 14px; line-height: 1.55; }
  .f { display: flex; flex-direction: column; gap: 6px; label { font-size: 13px; color: var(--text-muted); } }
  .f input { height: 40px; padding: 0 12px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--glass); color: var(--text-primary); font: inherit; font-size: 14px; outline: none; transition: border-color .15s, box-shadow .15s;
    &:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); } }
  .progress { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; font-size: 13.5px; color: var(--text-muted); b { color: var(--text-primary); } }
  .bar { flex: 1; height: 4px; border-radius: 2px; background: var(--bg-hover); overflow: hidden;
    span { display: block; height: 100%; background: var(--accent); border-radius: 2px; transition: width .4s cubic-bezier(.2,.8,.2,1); } }
  .list { display: flex; flex-direction: column; gap: 14px; }
  .cand { display: grid; grid-template-columns: 200px 1fr; gap: 20px; padding: 16px; border-radius: var(--radius-l); border: 1px solid var(--border);
    background: var(--bg-surface); border-left: 4px solid var(--border); transition: border-color .2s; }
  .cand[data-v="OUI"] { border-left-color: var(--series-3); }
  .cand[data-v="PEUT_ETRE"] { border-left-color: var(--series-2); }
  .cand[data-v="NON"] { border-left-color: var(--text-subtle); }
  .photo { aspect-ratio: 3 / 4; border-radius: var(--radius-m); overflow: hidden; background: var(--bg-hover); display: grid; place-items: center;
    img { width: 100%; height: 100%; object-fit: cover; } }
  .init { font-size: 34px; font-weight: 700; color: var(--text-muted); }
  .body { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  h3 { font-size: 26px; line-height: 1.1; }
  .sub { color: var(--text-muted); font-size: 14px; }
  .bio { line-height: 1.55; font-size: 14.5px; }
  .tags { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; padding: 0; margin: 0;
    li { font-size: 12.5px; padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border); } li.k { background: var(--bg-hover); border-color: transparent; } }
  .exp { margin: 0; padding-left: 18px; font-size: 13.5px; color: var(--text-muted); line-height: 1.6; }
  .vote { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  .vote button { height: 40px; min-width: 104px; padding: 0 16px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--glass);
    color: var(--text-primary); font-size: 14.5px; font-weight: 600; cursor: pointer; transition: background .15s, border-color .15s, color .15s;
    &:hover { border-color: var(--text-muted); } &:disabled { opacity: .6; cursor: progress; } }
  .vote button[aria-checked="true"][data-c="OUI"] { background: var(--series-3); border-color: var(--series-3); color: #fff; }
  .vote button[aria-checked="true"][data-c="PEUT_ETRE"] { background: var(--series-2); border-color: var(--series-2); color: #fff; }
  .vote button[aria-checked="true"][data-c="NON"] { background: var(--text-primary); border-color: var(--text-primary); color: var(--bg-surface); }
  textarea { width: 100%; padding: 8px 10px; border-radius: var(--radius-s); border: 1px solid var(--border); background: var(--glass); color: var(--text-primary);
    font: inherit; font-size: 14px; resize: vertical; &:focus { outline: none; border-color: var(--accent); } }
  .saved { font-size: 12.5px; color: var(--text-muted); }
  .none, .foot { color: var(--text-muted); font-size: 14px; }
  .foot { text-align: center; margin-top: 8px; }
  .state { padding: 80px 0; text-align: center; h1 { font-size: 38px; } p { margin-top: 12px; color: var(--text-muted); } }
  .skel { height: 260px; border-radius: var(--radius-l); background: var(--bg-hover); }
  @media (max-width: 680px) {
    .page { padding: 24px 14px 48px; }
    .me { grid-template-columns: 1fr; }
    .cand { grid-template-columns: 84px 1fr; gap: 10px 14px; padding: 12px; align-items: start; }
    .photo { grid-row: span 2; }
    .body { display: contents; }
    .body > * { grid-column: 1 / -1; }
    .body > h3, .body > .sub { grid-column: 2; }
    .body > h3 { align-self: end; }
    h3 { font-size: 21px; }
    .vote button { flex: 1; min-width: 0; padding: 0 8px; white-space: nowrap; }
  }
  @media (prefers-reduced-motion: reduce) { .bar span { transition: none; } }
  `]
})
export class DirectorShareComponent implements OnInit {
  private readonly api = inject(ShareService);
  private readonly route = inject(ActivatedRoute);

  readonly frDate = frDate;
  readonly label = VOTE_LABEL;
  readonly choices: Vote[] = ['OUI', 'PEUT_ETRE', 'NON'];
  readonly share = signal<PublicShare | null>(null);
  readonly gone = signal(false);
  readonly missing = signal(false);
  readonly saving = signal<string | null>(null);
  readonly savedFor = signal<string | null>(null);
  readonly errorFor = signal<string | null>(null);
  readonly error = signal('');
  readonly nameMissing = signal(false);
  readonly broken = signal<Set<string>>(new Set());
  private readonly tick = signal(0);
  readonly answered = computed(() => { this.tick(); return (this.share()?.candidates ?? []).filter(c => c.vote).length; });
  voterName = '';
  private token = '';

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    try { this.voterName = localStorage.getItem(NAME_KEY) ?? ''; } catch { /* stockage indisponible */ }
    this.api.view(this.token).subscribe({
      next: s => { this.share.set(s); if (!this.voterName && s.voterName) this.voterName = s.voterName; },
      error: (e: HttpErrorResponse) => e.status === 410 ? this.gone.set(true) : this.missing.set(true)
    });
  }

  facts(c: PublicCandidate): string {
    return [c.age ? c.age + ' ans' : '', c.gender ?? '', c.city ?? '', c.height ? c.height + ' cm' : ''].filter(Boolean).join(' · ');
  }

  rememberName(): void {
    const n = this.voterName.trim();
    if (n) { this.nameMissing.set(false); try { localStorage.setItem(NAME_KEY, n); } catch { /* sans effet */ } }
  }

  vote(c: PublicCandidate, v: Vote): void {
    if (!this.voterName.trim()) { this.nameMissing.set(true); document.getElementById('voter')?.focus(); return; }
    this.rememberName();
    const previous = c.vote;
    c.vote = v;
    this.tick.update(n => n + 1);
    this.send(c, () => { c.vote = previous; this.tick.update(n => n + 1); });
  }

  saveComment(c: PublicCandidate): void {
    if (!this.voterName.trim()) { this.nameMissing.set(true); return; }
    this.send(c);
  }

  markBroken(url: string): void { this.broken.update(s => new Set(s).add(url)); }

  private send(c: PublicCandidate, rollback?: () => void): void {
    this.saving.set(c.entryId);
    this.errorFor.set(null);
    this.api.vote(this.token, c.entryId, c.vote!, c.comment ?? '', this.voterName.trim()).subscribe({
      next: () => {
        this.saving.set(null);
        this.savedFor.set(c.entryId);
        setTimeout(() => this.savedFor() === c.entryId && this.savedFor.set(null), 2000);
      },
      error: (e: HttpErrorResponse) => {
        this.saving.set(null);
        rollback?.();
        if (e.status === 410) { this.share.set(null); this.gone.set(true); return; }
        this.errorFor.set(c.entryId);
        this.error.set(e.error?.message ?? 'Avis non enregistré. Réessayez.');
      }
    });
  }
}
