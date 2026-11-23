import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { LiveService } from '../../core/services/live.service';
import { DemandeDetail } from '../../core/services/demande.service';

interface Person { id: string; name: string; side: string; }
interface Comment { id: string; authorId: string | null; authorName: string; side: string | null; body: string; mentions: string[]; createdAt: string; mine: boolean; }
interface Thread { people: Person[]; comments: Comment[]; }
type Part = { text: string; at: boolean };

/**
 * P3 · Discussion de l'équipe sur un projet : une question, une précision, sans décrocher le téléphone.
 * « @ » propose les membres de l'équipe ; la personne mentionnée est prévenue dans sa cloche.
 * « Partager le point » prépare un résumé à envoyer par WhatsApp ou e-mail.
 */
@Component({
  selector: 'app-discussion',
  standalone: true,
  imports: [DatePipe, FormsModule],
  template: `
  <section class="card disc" id="discussion" aria-labelledby="disc-h">
    <div class="dh">
      <h2 id="disc-h">Discussion de l'équipe</h2>
      <button type="button" class="share-btn" [attr.aria-expanded]="sharing()" (click)="sharing.set(!sharing())">Partager le point</button>
    </div>
    @if (sharing()) {
      <div class="share">
        <p>Résumé prêt à envoyer à ceux qui n'ont pas la plateforme ouverte :</p>
        <pre>{{ point() }}</pre>
        <div class="sh-actions">
          <a class="sh" [href]="'https://wa.me/?text=' + enc(point())" target="_blank" rel="noopener">WhatsApp</a>
          <a class="sh" [href]="'mailto:?subject=' + enc('Point projet · ' + d().title) + '&body=' + enc(point())">E-mail</a>
          <button type="button" class="sh" (click)="copy()">{{ copied() ? 'Copié' : 'Copier' }}</button>
        </div>
      </div>
    }

    @if (thread().comments.length) {
      <ol class="msgs" aria-label="Messages">
        @for (c of thread().comments; track c.id) {
          <li [class.mine]="c.mine">
            <div class="meta"><b>{{ c.mine ? 'Vous' : c.authorName }}</b>@if (c.side) { <span class="side">{{ c.side }}</span> }<time>{{ c.createdAt | date:'d MMM, HH:mm' }}</time></div>
            <p>@for (p of parts(c.body); track $index) {@if (p.at) {<mark>{{ p.text }}</mark>} @else {<span>{{ p.text }}</span>}}</p>
          </li>
        }
      </ol>
    } @else if (loaded()) {
      <p class="empty">Aucun message pour l'instant. Posez ici les questions que vous régleriez par téléphone : toute l'équipe les verra.</p>
    }

    <form class="composer" (ngSubmit)="send()">
      <label class="sr" for="disc-in">Votre message</label>
      <div class="box">
        <textarea #ta id="disc-in" name="body" rows="2" maxlength="2000" [(ngModel)]="text" (input)="onInput()" (keydown)="onKey($event)"
                  placeholder="Écrivez à l'équipe… tapez @ pour mentionner quelqu'un" [attr.aria-describedby]="err() ? 'disc-err' : null"></textarea>
        @if (suggest().length) {
          <ul class="sugg" role="listbox" aria-label="Mentionner">
            @for (p of suggest(); track p.id; let i = $index) {
              <li role="option" [attr.aria-selected]="i === pick()"><button type="button" [class.on]="i === pick()" (mousedown)="$event.preventDefault(); mention(p)">{{ p.name }} <small>{{ p.side }}</small></button></li>
            }
          </ul>
        }
      </div>
      @if (err()) { <p class="field-msg" id="disc-err" role="alert">{{ err() }}</p> }
      <div class="row">
        <div class="quick" aria-label="Mentionner rapidement">
          @for (p of others(); track p.id) { <button type="button" class="chip" (click)="mention(p, true)">&#64;{{ first(p.name) }}</button> }
        </div>
        <button type="submit" class="send" [disabled]="busy() || !text.trim()">Envoyer</button>
      </div>
    </form>
  </section>
  `,
  styles: [`
    :host { display: block; }
    .disc { scroll-margin-top: 70px; padding: 18px 20px; border-radius: 18px; border: 1px solid var(--border); background: var(--glass); }
    .dh h2 { font-size: 19px; }
    @media (max-width: 600px) { .disc { padding: 14px; } }
    .dh { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .dh h2 { margin: 0; }
    .share-btn, .sh { min-height: 40px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary);
      font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
    .share { margin-top: 10px; padding: 12px; border-radius: 12px; border: 1px dashed var(--border); display: flex; flex-direction: column; gap: 8px; }
    .share p { margin: 0; font-size: 13px; color: var(--text-muted); }
    .share pre { margin: 0; white-space: pre-wrap; font: inherit; font-size: 13.5px; line-height: 1.45; }
    .sh-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .msgs { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 420px; overflow-y: auto; }
    .msgs li { max-width: 86%; padding: 9px 12px; border-radius: 14px 14px 14px 4px; background: var(--glass); border: 1px solid var(--border); animation: m-in .25s ease-out both; }
    .msgs li.mine { align-self: flex-end; border-radius: 14px 14px 4px 14px; background: var(--accent-dim); border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); }
    @keyframes m-in { from { opacity: 0; transform: translateY(6px); } }
    .meta { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 12.5px; }
    .meta b { font-size: 13px; } .side { font-weight: 700; color: var(--accent-ink); } time { color: var(--text-muted); }
    .msgs p { margin: 4px 0 0; font-size: 14.5px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
    mark { background: none; color: var(--accent-ink); font-weight: 700; }
    .empty { margin: 10px 0 0; color: var(--text-muted); font-size: 14px; }
    .composer { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
    .box { position: relative; }
    textarea { width: 100%; box-sizing: border-box; resize: vertical; }
    .sugg { position: absolute; left: 0; bottom: calc(100% + 4px); z-index: 5; list-style: none; margin: 0; padding: 4px; min-width: 220px; border-radius: 12px;
      border: 1px solid var(--border); background: var(--bg-secondary); box-shadow: 0 14px 30px color-mix(in srgb, var(--graphite-950) 25%, transparent); }
    .sugg button { width: 100%; min-height: 40px; display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 0 10px; border: 0; border-radius: 8px;
      background: none; color: var(--text-primary); font: inherit; font-size: 14px; cursor: pointer; text-align: left; }
    .sugg button.on, .sugg button:hover { background: var(--accent-dim); }
    .sugg small { color: var(--text-muted); font-size: 12px; }
    .row { display: flex; align-items: center; gap: 10px; justify-content: space-between; flex-wrap: wrap; }
    .quick { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; min-width: 0; }
    .chip { min-height: 36px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--border); background: none; color: var(--text-secondary); font: inherit; font-size: 13px; cursor: pointer; }
    .chip:hover { color: var(--accent-ink); border-color: var(--accent); }
    .send { min-height: 44px; padding: 0 20px; border: 0; border-radius: 999px; background: var(--accent); color: var(--on-accent); font: inherit; font-weight: 700; cursor: pointer; }
    .send:disabled { opacity: .5; cursor: default; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @media (pointer: coarse) { .chip { min-height: 44px; } .share-btn, .sh { min-height: 44px; } }
    @media (prefers-reduced-motion: reduce) { .msgs li { animation: none; } }
  `]
})
export class DiscussionComponent {
  private readonly http = inject(HttpClient);
  readonly d = input.required<DemandeDetail>();
  readonly thread = signal<Thread>({ people: [], comments: [] });
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly err = signal('');
  readonly sharing = signal(false);
  readonly copied = signal(false);
  readonly query = signal<string | null>(null);
  readonly pick = signal(0);
  readonly ta = viewChild<ElementRef<HTMLTextAreaElement>>('ta');
  text = '';
  private mentions = new Set<string>();
  private readonly url = computed(() => `${environment.apiUrl}/demandes/${this.d().id}/discussion`);

  /** Les autres membres (on ne se mentionne pas soi-même). */
  readonly others = computed(() => {
    const mine = new Set(this.thread().comments.filter(c => c.mine).map(c => c.authorId));
    return this.thread().people.filter(p => !mine.has(p.id)).slice(0, 8);
  });
  readonly suggest = computed(() => {
    const q = this.query(); if (q === null) return [];
    const n = this.norm(q);
    return this.others().filter(p => this.norm(p.name).split(' ').some(w => w.startsWith(n)) || this.norm(p.name).startsWith(n)).slice(0, 6);
  });

  /** Le point du jour, prêt à partager. */
  readonly point = computed(() => {
    const x = this.d();
    const last = x.events.slice(0, 3).map(e => '· ' + e.message).join('\n');
    return `${x.title}\nEn ce moment : ${x.nowWho ? x.nowWho + ' ' : ''}${x.nowWhat}${last ? '\n\nDernières étapes :\n' + last : ''}\n\n${location.origin}/demandes/${x.id}`;
  });

  constructor() {
    effect(() => { this.d().id; untracked(() => this.load()); });
    inject(LiveService).watch(inject(DestroyRef), () => this.load(), () => this.busy());
  }

  load(): void {
    this.http.get<Thread>(this.url()).subscribe({ next: t => { this.thread.set(t); this.loaded.set(true); }, error: () => this.loaded.set(true) });
  }

  send(): void {
    const body = this.text.trim(); if (!body || this.busy()) return;
    // On ne garde que les mentions encore présentes dans le texte
    const ids = this.thread().people.filter(p => this.mentions.has(p.id) && body.includes('@' + p.name)).map(p => p.id);
    this.busy.set(true); this.err.set('');
    this.http.post<Thread>(this.url(), { body, mentions: ids }).subscribe({
      next: t => { this.thread.set(t); this.text = ''; this.mentions.clear(); this.busy.set(false); this.query.set(null); },
      error: (e: HttpErrorResponse) => { this.busy.set(false); this.err.set(e.error?.message || 'Message non envoyé. Réessayez.'); }
    });
  }

  onInput(): void {
    const el = this.ta()?.nativeElement; if (!el) return;
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    const m = /(^|\s)@([\p{L}\-]*)$/u.exec(before);
    this.query.set(m ? m[2] : null); this.pick.set(0);
  }

  onKey(e: KeyboardEvent): void {
    const list = this.suggest();
    if (list.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.pick.set((this.pick() + 1) % list.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.pick.set((this.pick() - 1 + list.length) % list.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.mention(list[this.pick()]); return; }
      if (e.key === 'Escape') { this.query.set(null); return; }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.send(); }
  }

  /** Insère « @Prénom Nom » à la place du « @… » en cours, ou à la fin. */
  mention(p: Person, append = false): void {
    const el = this.ta()?.nativeElement;
    const tag = '@' + p.name + ' ';
    if (!append && el && this.query() !== null) {
      const pos = el.selectionStart ?? this.text.length;
      const start = this.text.slice(0, pos).lastIndexOf('@');
      this.text = this.text.slice(0, start) + tag + this.text.slice(pos);
    } else {
      this.text = (this.text && !/\s$/.test(this.text) ? this.text + ' ' : this.text) + tag;
    }
    this.mentions.add(p.id); this.query.set(null);
    setTimeout(() => { el?.focus(); const end = this.text.length; el?.setSelectionRange(end, end); });
  }

  /** Découpe un message pour mettre en avant les @mentions de l'équipe. */
  parts(body: string): Part[] {
    const names = this.thread().people.map(p => '@' + p.name).sort((a, b) => b.length - a.length);
    if (!names.length) return [{ text: body, at: false }];
    const re = new RegExp('(' + names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
    return body.split(re).filter(s => s).map(s => ({ text: s, at: names.includes(s) }));
  }

  first(name: string): string { return name.split(' ')[0]; }
  enc(s: string): string { return encodeURIComponent(s); }
  copy(): void {
    navigator.clipboard?.writeText(this.point()).then(() => { this.copied.set(true); setTimeout(() => this.copied.set(false), 2000); }).catch(() => {});
  }
  private norm(s: string): string { return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(); }
}
