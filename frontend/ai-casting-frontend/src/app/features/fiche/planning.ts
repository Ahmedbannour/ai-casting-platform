import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { FicheService, PlanStep, Sheet } from './fiche.service';

const DAY = 86400000;
const SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const WHO = ['Production', 'Réalisation', 'Marque', 'Agence', 'Post-production'];
const PRESETS = ['Repérages', 'Casting', 'Rappels de casting', 'Essais costumes et maquillage', 'PPM (réunion de préparation)', 'Tournage',
  'Montage', 'Voix off', 'Étalonnage, son et musique', 'Sous-titrage', 'Validation de la marque', 'Déclinaisons réseaux sociaux', 'Livraison des fichiers'];

/**
 * P-087 · Le planning de production : des étapes datées sur une frise, du casting à la livraison.
 * Le rétroplanning se construit à partir des dates de tournage et de diffusion ; l'IA l'ajuste au projet
 * (dates précises, étapes utiles, une note concrète par étape) sans toucher au tournage ni à la diffusion.
 */
@Component({
  selector: 'app-planning',
  standalone: true,
  imports: [FormsModule],
  template: `
  <div class="pl">
    @if (!editing()) {
      @if (steps().length) {
        <div class="frise" role="img" [attr.aria-label]="'Frise du planning, du ' + fr(range()!.a) + ' au ' + fr(range()!.b)">
          <div class="months" aria-hidden="true">@for (m of months(); track m.label) { <span [style.left.%]="m.x">{{ m.label }}</span> }</div>
          @if (todayX() !== null) { <i class="today" [style.left.%]="todayX()" aria-hidden="true"><span>Aujourd’hui</span></i> }
          <ol class="bars">
            @for (s of steps(); track $index) {
              <li [attr.data-k]="kind(s)">
                <span class="b-name" [title]="s.etape">{{ s.etape }}</span>
                <span class="b-track"><b [style.left.%]="x(s.debut)" [style.width.%]="w(s)"></b></span>
              </li>
            }
          </ol>
        </div>
        <ul class="list">
          @for (s of steps(); track $index) {
            <li [attr.data-k]="kind(s)">
              <span class="l-dot" aria-hidden="true"></span>
              <div class="l-main">
                <p class="l-top"><b>{{ s.etape }}</b>@if (s.qui) { <span class="who">{{ s.qui }}</span> }</p>
                <p class="l-date">{{ span(s) }}@if (countdown(s); as c) { <em>{{ c }}</em> }</p>
                @if (s.note) { <p class="l-note">{{ s.note }}</p> }
              </div>
            </li>
          }
        </ul>
      } @else if (legacy()) {
        <p class="legacy">{{ legacy() }}</p>
        @if (canEdit()) { <p class="hint">Ce planning est un texte libre : construisez-le en étapes datées pour voir la frise.</p> }
      } @else {
        <p class="empty">{{ canEdit() ? 'Pas encore de planning. Il se construit en un clic à partir des dates de tournage et de diffusion.' : 'Le planning sera posé par la production.' }}</p>
      }
      @if (canEdit()) {
        <div class="actions">
          @if (!steps().length) { <button type="button" class="go" [disabled]="busy()" (click)="build()">{{ busy() ? 'L’IA prépare le planning…' : '✦ Construire le planning' }}</button> }
          @else { <button type="button" class="tool" (click)="edit()">Modifier le planning</button> }
        </div>
        @if (err()) { <p class="err" role="alert">{{ err() }}</p> }
      }
    } @else {
      <div class="ed">
        <header class="ed-bar">
          <div class="ed-title">
            <b>Modifier le planning</b>
            @if (draftSpan(); as r) { <span>{{ draft.length }} étape{{ draft.length > 1 ? 's' : '' }} · {{ fr(r.a) }} → {{ fr(r.b) }}</span> }
          </div>
          <div class="ed-tools">
            <button type="button" class="tool" (click)="sortByDate()" title="Remettre les étapes dans l’ordre des dates">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M14 6h7M14 12h5M14 18h3"/></svg>Trier par date</button>
            <button type="button" class="tool ai" [disabled]="busy()" (click)="build()">{{ busy() ? 'L’IA ajuste…' : '✦ Ajuster avec l’IA' }}</button>
          </div>
        </header>
        @if (note()) { <p class="note" role="status">{{ note() }}</p> }

        <ol class="cards" (keydown)="keys($event)">
          @for (s of draft; track $index; let i = $index) {
            <li class="card" [attr.data-k]="kind(s)">
              <div class="c-head">
                <span class="c-num" aria-hidden="true">{{ i + 1 }}</span>
                <input class="c-name" [(ngModel)]="s.etape" [name]="'e' + i" aria-label="Nom de l’étape" placeholder="Nom de l’étape" maxlength="80" />
                <span class="c-dur" [attr.aria-label]="'Durée : ' + dur(s) + ' jours'">{{ dur(s) }} j</span>
                <span class="c-act">
                  <button type="button" class="ic" (click)="move(i, -1)" [disabled]="i === 0" aria-label="Monter l’étape" title="Monter">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button>
                  <button type="button" class="ic" (click)="move(i, 1)" [disabled]="i === draft.length - 1" aria-label="Descendre l’étape" title="Descendre">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
                  <button type="button" class="ic del" (click)="del(i)" [attr.aria-label]="'Retirer ' + (s.etape || 'l’étape')" title="Retirer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
                </span>
              </div>
              <div class="c-pos" aria-hidden="true"><b [style.left.%]="dx(s.debut)" [style.width.%]="dw(s)"></b></div>
              <div class="c-grid">
                <label class="f"><span>Début</span><input type="date" [(ngModel)]="s.debut" [name]="'d' + i" (change)="fix(s)" /></label>
                <label class="f"><span>Fin</span><input type="date" [(ngModel)]="s.fin" [name]="'f' + i" [min]="s.debut" (change)="fix(s)" /></label>
                <div class="f"><span id="dur-{{ i }}">Durée</span>
                  <div class="stepper" role="group" [attr.aria-labelledby]="'dur-' + i">
                    <button type="button" (click)="setDur(s, dur(s) - 1)" [disabled]="dur(s) <= 1" aria-label="Un jour de moins">−</button>
                    <output>{{ dur(s) }} jour{{ dur(s) > 1 ? 's' : '' }}</output>
                    <button type="button" (click)="setDur(s, dur(s) + 1)" aria-label="Un jour de plus">+</button>
                  </div>
                </div>
                <label class="f"><span>Qui</span><select [(ngModel)]="s.qui" [name]="'q' + i">@for (q of who; track q) { <option [value]="q">{{ q }}</option> }</select></label>
                <label class="f f-note"><span>Note</span><input [(ngModel)]="s.note" [name]="'n' + i" placeholder="Qui fait quoi, quel livrable" maxlength="200" /></label>
              </div>
            </li>
          }
        </ol>

        <div class="add">
          <button type="button" class="add-btn" [attr.aria-expanded]="adding()" (click)="adding.set(!adding())">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Ajouter une étape</button>
          @if (adding()) {
            <div class="chips" role="group" aria-label="Étapes à ajouter">
              @for (p of missing(); track p) { <button type="button" class="qchip" (click)="add(p)">{{ p }}</button> }
              <button type="button" class="qchip free" (click)="add('')">Autre étape…</button>
            </div>
          }
        </div>

        @if (warnings().length) {
          <ul class="warns" aria-label="Points à vérifier">@for (w of warnings(); track w) { <li>{{ w }}</li> }</ul>
        }
        @if (err()) { <p class="err" role="alert">{{ err() }}</p> }
        <div class="ed-foot">
          <span class="hint">Ctrl + Entrée pour enregistrer</span>
          <span class="foot-btns">
            <button type="button" class="tool" (click)="cancel()">Annuler</button>
            <button type="button" class="go" [disabled]="busy()" (click)="save()">Enregistrer<span class="long"> le planning</span></button>
          </span>
        </div>
      </div>
    }
  </div>
  `,
  styles: [`
    :host { display: block; width: 100%; container: plan / inline-size; }
    .pl { display: flex; flex-direction: column; gap: 12px; }
    .frise { position: relative; padding: 22px 0 4px; }
    .months { position: absolute; top: 0; left: 150px; right: 0; height: 16px; }
    .months span { position: absolute; font-size: 11px; color: var(--text-muted); white-space: nowrap; border-left: 1px solid var(--border); padding-left: 4px; height: 100%; }
    .today { position: absolute; top: 16px; bottom: 0; left: 0; width: 2px; background: var(--accent); margin-left: 150px; transform: translateX(-1px); z-index: 1; }
    .today span { position: absolute; top: -16px; left: 4px; font-size: 10.5px; font-weight: 700; color: var(--accent-ink); white-space: nowrap; font-style: normal; }
    .bars { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
    .bars li { display: grid; grid-template-columns: 142px 1fr; gap: 8px; align-items: center; }
    .b-name { font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }
    .b-track { position: relative; height: 14px; border-radius: 7px; background: color-mix(in srgb, var(--text-subtle) 10%, transparent); }
    .b-track b { position: absolute; top: 0; bottom: 0; min-width: 8px; border-radius: 7px; background: var(--text-subtle); animation: grow .6s cubic-bezier(.2,.8,.2,1) both; transform-origin: left; }
    li[data-k="prep"] .b-track b { background: var(--accent); }
    li[data-k="shoot"] .b-track b { background: var(--success); }
    li[data-k="post"] .b-track b { background: color-mix(in srgb, var(--accent) 45%, var(--text-subtle)); }
    li[data-k="brand"] .b-track b { background: color-mix(in srgb, #4f7cff 70%, transparent); }
    li[data-k="air"] .b-track b { background: var(--danger); }
    @keyframes grow { from { transform: scaleX(0); } }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0; border-left: 2px solid var(--border); margin-left: 6px; }
    .list li { position: relative; display: flex; gap: 10px; padding: 0 0 12px 16px; }
    .l-dot { position: absolute; left: -7px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: var(--bg-primary); border: 2px solid var(--text-subtle); }
    .list li[data-k="prep"] .l-dot { border-color: var(--accent); } .list li[data-k="shoot"] .l-dot { background: var(--success); border-color: var(--success); }
    .list li[data-k="air"] .l-dot { background: var(--danger); border-color: var(--danger); }
    .l-main p { margin: 0; } .l-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; font-size: 14.5px; }
    .who { font-size: 11.5px; font-weight: 700; padding: 1px 8px; border-radius: 999px; background: var(--bg-secondary); color: var(--text-secondary); }
    .l-date { font-size: 13px; color: var(--text-secondary); margin-top: 2px !important; } .l-date em { font-style: normal; margin-left: 8px; color: var(--accent-ink); font-weight: 600; }
    .l-note { font-size: 13px; color: var(--text-muted); margin-top: 2px !important; line-height: 1.45; }
    .legacy { white-space: pre-wrap; margin: 0; font-size: 14.5px; }
    .empty, .hint { margin: 0; font-size: 13.5px; color: var(--text-muted); }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .go { min-height: 42px; padding: 0 18px; border: 0; border-radius: 999px; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 700; cursor: pointer; } .go:disabled { opacity: .55; }
    .tool { min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
    .tool.ai { border-color: var(--accent); color: var(--accent-ink); } .tool:disabled { opacity: .55; }
    .ed { display: flex; flex-direction: column; gap: 12px; }
    .ed-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
    .ed-title { display: flex; flex-direction: column; gap: 1px; } .ed-title b { font-size: 15px; } .ed-title span { font-size: 12.5px; color: var(--text-muted); }
    .ed-tools { display: flex; flex-wrap: wrap; gap: 6px; }
    .tool { display: inline-flex; align-items: center; gap: 6px; }
    .note { margin: 0; font-size: 13px; color: var(--accent-ink); }
    .cards { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; counter-reset: st; }
    .card { --k: var(--text-subtle); position: relative; padding: 12px 14px 14px 16px; border-radius: 14px; background: var(--bg-secondary); border: 1px solid var(--border);
      transition: border-color .15s, box-shadow .15s; }
    .card::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 4px; border-radius: 0 4px 4px 0; background: var(--k); }
    .card:focus-within { border-color: color-mix(in srgb, var(--k) 70%, var(--border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--k) 18%, transparent); }
    .card[data-k="prep"] { --k: var(--accent); } .card[data-k="shoot"] { --k: var(--success); } .card[data-k="air"] { --k: var(--danger); }
    .card[data-k="post"] { --k: color-mix(in srgb, var(--accent) 45%, var(--text-subtle)); } .card[data-k="brand"] { --k: #4f7cff; }
    .c-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .c-num { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 800;
      background: color-mix(in srgb, var(--k) 22%, transparent); color: var(--text-primary); }
    .c-name { flex: 1; min-width: 0; height: 36px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--text-primary);
      font: inherit; font-size: 15.5px; font-weight: 700; padding: 0 8px; margin-left: -8px; }
    .c-name:hover { border-color: var(--border); } .c-name:focus { border-color: var(--k); background: var(--bg-primary); outline: none; }
    .c-dur { flex: none; font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: var(--bg-primary); color: var(--text-secondary); }
    .c-act { flex: none; display: flex; gap: 2px; }
    .ic { width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 8px; background: transparent; color: var(--text-muted); cursor: pointer; }
    .ic:hover:not(:disabled) { background: var(--bg-primary); color: var(--text-primary); } .ic.del:hover { color: var(--danger); }
    .ic:disabled { opacity: .3; cursor: default; }
    .c-pos { position: relative; height: 4px; margin: 8px 0 12px 36px; border-radius: 2px; background: color-mix(in srgb, var(--text-subtle) 14%, transparent); }
    .c-pos b { position: absolute; top: 0; bottom: 0; min-width: 6px; border-radius: 2px; background: var(--k); transition: left .25s, width .25s; }
    .c-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-left: 36px; }
    .f { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .f > span { font-size: 11.5px; font-weight: 600; color: var(--text-muted); }
    .f-note { grid-column: 1 / -1; }
    .f input, .f select { width: 100%; box-sizing: border-box; min-height: 40px; border-radius: 9px; border: 1px solid var(--border); background: var(--bg-primary);
      color: var(--text-primary); padding: 0 10px; font: inherit; font-size: 14px; color-scheme: light dark; }
    .f input:focus, .f select:focus { outline: none; border-color: var(--k); }
    .stepper { display: grid; grid-template-columns: 36px 1fr 36px; align-items: center; min-height: 40px; border: 1px solid var(--border); border-radius: 9px; background: var(--bg-primary); overflow: hidden; }
    .stepper button { height: 100%; min-height: 38px; border: 0; background: transparent; color: var(--text-secondary); font-size: 18px; font-weight: 700; cursor: pointer; }
    .stepper button:hover:not(:disabled) { background: var(--bg-hover, var(--bg-secondary)); color: var(--text-primary); } .stepper button:disabled { opacity: .3; }
    .stepper output { text-align: center; font-size: 14px; font-weight: 600; white-space: nowrap; }
    .add { display: flex; flex-direction: column; gap: 8px; }
    .add-btn { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 16px; border-radius: 999px;
      border: 1.5px dashed color-mix(in srgb, var(--accent) 60%, var(--border)); background: none; color: var(--text-primary); font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; }
    .add-btn:hover, .add-btn[aria-expanded="true"] { background: var(--accent-dim, color-mix(in srgb, var(--accent) 12%, transparent)); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px; border-radius: 12px; background: var(--bg-secondary); }
    .qchip { min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-secondary);
      font: inherit; font-size: 13px; cursor: pointer; }
    .qchip:hover { border-color: var(--accent); color: var(--text-primary); } .qchip.free { border-style: dashed; }
    .warns { list-style: none; margin: 0; padding: 10px 12px; border-radius: 12px; display: flex; flex-direction: column; gap: 4px; font-size: 13px;
      background: color-mix(in srgb, var(--warning, #e0a400) 12%, transparent); border: 1px solid color-mix(in srgb, var(--warning, #e0a400) 35%, transparent); }
    .warns li::before { content: '⚠ '; }
    .ed-foot { position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between;
      margin: 0 -4px; padding: 10px 4px; background: linear-gradient(to top, var(--bg-primary) 70%, transparent); }
    .foot-btns { display: flex; gap: 8px; margin-left: auto; }
    .go { white-space: nowrap; }
    @container plan (max-width: 620px) {
      .c-head { flex-wrap: wrap; row-gap: 6px; }
      .c-name { order: 5; flex: 1 0 100%; margin-left: 0; font-size: 16px; border-color: var(--border); background: var(--bg-primary); }
      .c-act { margin-left: auto; }
      .long { display: none; }
      .c-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-left: 0; }
      .c-pos { margin-left: 0; }
      .hint { display: none; }
      .foot-btns { width: 100%; } .foot-btns .go { flex: 1; }
    }
    @container plan (max-width: 380px) {
      .c-grid { grid-template-columns: 1fr; }
      .c-dur { display: none; }
    }
    .warn { margin: 0; padding: 7px 10px; border-radius: 8px; font-size: 13px; background: color-mix(in srgb, var(--warning, #e0a400) 14%, transparent); }
    .err { margin: 0; font-size: 13.5px; color: var(--danger); }
    @media (prefers-reduced-motion: reduce) { .b-track b { animation: none; } }
  `]
})
export class PlanningComponent {
  private readonly api = inject(FicheService);
  readonly requestId = input.required<string>();
  readonly value = input<string | null>(null);
  readonly canEdit = input(false);
  readonly shoot = input<string | null>(null);   // « AAAA-MM-JJ/AAAA-MM-JJ »
  readonly air = input<string | null>(null);
  readonly saved = output<Sheet>();

  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly adding = signal(false);
  readonly note = signal('');
  readonly err = signal('');
  readonly who = WHO;
  readonly presets = PRESETS;
  draft: PlanStep[] = [];
  private readonly tick = signal(0);   // relance les avertissements pendant l'édition

  readonly steps = computed<PlanStep[]>(() => {
    const v = this.value();
    if (!v) return [];
    try { const a = JSON.parse(v); return Array.isArray(a) ? a.filter(s => s && s.etape && s.debut) : []; } catch { return []; }
  });
  readonly legacy = computed(() => { const v = this.value(); return v && !this.steps().length ? v : ''; });
  readonly range = computed(() => {
    const st = this.steps(); if (!st.length) return null;
    let a = st[0].debut, b = st[0].fin || st[0].debut;
    for (const s of st) { if (s.debut < a) a = s.debut; if ((s.fin || s.debut) > b) b = s.fin || s.debut; }
    return { a, b, len: Math.max(1, this.days(a, b) + 1) };
  });
  readonly months = computed(() => {
    const r = this.range(); if (!r) return [];
    const out: { label: string; x: number }[] = [];
    const d = new Date(r.a + 'T12:00'); d.setDate(1); d.setMonth(d.getMonth() + 1);
    while (this.iso(d) <= r.b) { out.push({ label: MONTHS[d.getMonth()] + (d.getMonth() === 0 ? ' ' + d.getFullYear() : ''), x: this.x(this.iso(d)) }); d.setMonth(d.getMonth() + 1); }
    return out;
  });
  readonly todayX = computed(() => { const r = this.range(), t = this.iso(new Date()); return r && t >= r.a && t <= r.b ? this.x(t) : null; });

  // ── Frise ──
  x(d: string): number { const r = this.range()!; return this.days(r.a, d) / r.len * 100; }
  w(s: PlanStep): number { const r = this.range()!; return (this.days(s.debut, s.fin || s.debut) + 1) / r.len * 100; }
  kind(s: PlanStep): string {
    const e = (s.etape || '').toLowerCase();
    if (/diffusion/.test(e)) return 'air';
    if (/tournage/.test(e) && !/avant|repérage/.test(e)) return 'shoot';
    if (/validation|marque/.test(e)) return 'brand';
    if (/montage|étalonnage|son|mixage|voix|sous-titr|livraison|déclinaison/.test(e)) return 'post';
    return 'prep';
  }
  span(s: PlanStep): string { return !s.fin || s.fin === s.debut ? this.fr(s.debut) : `du ${this.fr(s.debut)} au ${this.fr(s.fin)} · ${this.days(s.debut, s.fin) + 1} jours`; }
  countdown(s: PlanStep): string {
    const n = this.days(this.iso(new Date()), s.debut), end = this.days(this.iso(new Date()), s.fin || s.debut);
    if (n > 0 && n <= 60) return `dans ${n} jour${n > 1 ? 's' : ''}`;
    if (n <= 0 && end >= 0) return 'en cours';
    return '';
  }

  // ── Édition ──
  edit(): void { this.draft = this.steps().map(s => ({ ...s, fin: s.fin || s.debut, qui: s.qui || 'Production', note: s.note || '' })); this.note.set(''); this.err.set(''); this.editing.set(true); }
  cancel(): void { this.editing.set(false); this.err.set(''); }
  add(name: string): void {
    const last = this.draft.length ? this.draft[this.draft.length - 1] : null;
    const d = last ? this.iso(new Date(new Date((last.fin || last.debut) + 'T12:00').getTime() + DAY)) : this.iso(new Date());
    this.draft = [...this.draft, { etape: name, debut: d, fin: d, qui: /validation/i.test(name) ? 'Marque' : /montage|étalonnage|voix|sous-titr|déclinaison/i.test(name) ? 'Post-production' : 'Production', note: '' }];
    this.tick.update(x => x + 1);
  }
  /** Durée en jours (début et fin compris). */
  dur(s: PlanStep): number { return s.debut ? Math.max(1, this.days(s.debut, s.fin || s.debut) + 1) : 1; }
  setDur(s: PlanStep, n: number): void { if (!s.debut) return; s.fin = this.iso(new Date(new Date(s.debut + 'T12:00').getTime() + (Math.max(1, n) - 1) * DAY)); this.tick.update(x => x + 1); }
  sortByDate(): void { this.draft = [...this.draft].sort((a, b) => (a.debut || '9').localeCompare(b.debut || '9') || (a.fin || '').localeCompare(b.fin || '')); }
  missing(): string[] { const have = new Set(this.draft.map(s => (s.etape || '').trim().toLowerCase())); return this.presets.filter(p => !have.has(p.toLowerCase())); }
  draftSpan(): { a: string; b: string; len: number } | null {
    const st = this.draft.filter(s => s.debut); if (!st.length) return null;
    let a = st[0].debut, b = st[0].fin || st[0].debut;
    for (const s of st) { if (s.debut < a) a = s.debut; if ((s.fin || s.debut) > b) b = s.fin || s.debut; }
    return { a, b, len: Math.max(1, this.days(a, b) + 1) };
  }
  dx(d: string): number { const r = this.draftSpan(); return r && d ? this.days(r.a, d) / r.len * 100 : 0; }
  dw(s: PlanStep): number { const r = this.draftSpan(); return r && s.debut ? this.dur(s) / r.len * 100 : 0; }
  del(i: number): void { this.draft = this.draft.filter((_, k) => k !== i); }
  move(i: number, d: number): void { const a = [...this.draft]; [a[i], a[i + d]] = [a[i + d], a[i]]; this.draft = a; }
  fix(s: PlanStep): void { if (!s.fin || s.fin < s.debut) s.fin = s.debut; this.tick.update(x => x + 1); }
  keys(e: KeyboardEvent): void { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.save(); } }

  warnings(): string[] {
    this.tick();
    const out: string[] = [], air = this.air(), shoot = this.shoot();
    const sorted = [...this.draft].filter(s => s.debut).sort((a, b) => a.debut.localeCompare(b.debut));
    if (air) for (const s of sorted) if ((s.fin || s.debut) > air && !/diffusion/i.test(s.etape)) out.push(`« ${s.etape || 'Étape'} » finit après la première diffusion (${this.fr(air)}).`);
    if (shoot) {
      const start = shoot.slice(0, 10);
      if (!sorted.some(s => /ppm/i.test(s.etape) && s.debut < start)) out.push('Pas de PPM avant le tournage : la marque doit valider acteurs, décors et costumes avant de tourner.');
      if (!sorted.some(s => /casting/i.test(s.etape) && s.debut < start)) out.push('Pas de casting avant le tournage.');
    }
    return out;
  }

  /** L'IA ajuste (ou construit) le planning à partir des dates du film. */
  build(): void {
    this.busy.set(true); this.err.set(''); this.note.set('');
    this.api.propose(this.requestId(), 'planning', '').subscribe({
      next: r => {
        this.busy.set(false);
        let steps: PlanStep[] = [];
        try { steps = JSON.parse(r.text ?? '[]'); } catch { steps = []; }
        if (!steps.length) { this.err.set('Le planning n’a pas pu être construit.'); return; }
        this.draft = steps.map(s => ({ ...s, fin: s.fin || s.debut, qui: s.qui || 'Production', note: s.note || '' }));
        this.editing.set(true);
        this.note.set(r.engine === 'IA' ? '✦ L’IA a ajusté le planning à votre projet : relisez, corrigez, puis enregistrez.'
          : 'Rétroplanning type posé à partir de vos dates (l’IA est indisponible pour l’instant) : ajustez-le puis enregistrez.');
      },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.err.set(e.error?.message || 'Le planning n’a pas pu être construit.'); }
    });
  }

  save(): void {
    const steps = this.draft.filter(s => s.etape.trim());
    if (steps.some(s => !s.debut)) { this.err.set('Chaque étape a une date de début.'); return; }
    this.busy.set(true); this.err.set('');
    this.api.save(this.requestId(), 'planning', JSON.stringify(steps.map(s => ({ ...s, etape: s.etape.trim(), fin: s.fin || s.debut })))).subscribe({
      next: s => { this.busy.set(false); this.editing.set(false); this.saved.emit(s); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.err.set(e.error?.message || 'L’enregistrement a échoué.'); }
    });
  }

  // ── Dates ──
  days(a: string, b: string): number { return Math.round((new Date(b + 'T12:00').getTime() - new Date(a + 'T12:00').getTime()) / DAY); }
  iso(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  fr(s: string): string { const d = new Date(s + 'T12:00'); return `${SHORT[d.getDay()]} ${d.getDate() === 1 ? '1er' : d.getDate()} ${MONTHS[d.getMonth()]}`; }
}

