import { Component, inject, input, signal, effect } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RoomDoc, RoomService, SIDE_LABEL } from '../../core/services/room.service';
import { DropzoneComponent } from '../../shared/components/dropzone/dropzone';

/** Documents partagés de la room : chacun ne voit que ce qui est ouvert à son rôle ; mise à jour par nouvelle version. */
@Component({
  selector: 'app-room-docs',
  standalone: true,
  imports: [DatePipe, DropzoneComponent],
  template: `
  @if (canEdit()) {
    <div class="add">
      <div class="aud">
        <span>Visible par</span>
        @for (a of audiences; track a) {
          <button type="button" class="chip" [class.on]="audience().includes(a)" [attr.aria-pressed]="audience().includes(a)" (click)="toggle(a)">{{ label(a) }}</button>
        }
      </div>
      <app-dropzone title="Partager un document" hint="Plan de travail, storyboard, contrat, essais costumes… 20 Mo maximum"
                    [formats]="['PDF', 'Office', 'Image', 'Vidéo']" [busy]="busy()" [disabled]="!audience().length" (file)="add($event)" />
    </div>
  }

  @if (!docs().length && !loading()) {
    <div class="empty"><h3>Aucun document pour l'instant</h3>
      <p>{{ canEdit() ? 'Déposez le premier : choisissez qui peut le voir, il sera partagé aussitôt.' : 'Les documents que l’équipe partage avec vous apparaîtront ici.' }}</p></div>
  }
  <ul class="list">
    @for (d of docs(); track d.id; let i = $index) {
      <li class="doc" [style.--d]="i">
        <span class="ic" [attr.data-k]="kind(d)" aria-hidden="true">{{ kind(d) }}</span>
        <div class="txt">
          <b>{{ d.name }}</b>
          <small>v{{ d.version }} · {{ d.updatedAt | date:'d MMM, HH:mm' }}{{ d.uploadedBy ? ' · ' + d.uploadedBy : '' }}{{ d.fileSize ? ' · ' + size(d.fileSize) : '' }}</small>
          <div class="aud small">
            @for (a of audiences; track a) {
              @if (d.canEdit) {
                <button type="button" class="chip mini" [class.on]="d.audience.includes(a)" (click)="setAud(d, a)" [title]="'Visible par ' + label(a)">{{ label(a) }}</button>
              } @else if (d.audience.includes(a)) { <span class="chip mini on">{{ label(a) }}</span> }
            }
          </div>
        </div>
        <div class="acts">
          <button type="button" class="btn" (click)="download(d)">Télécharger</button>
          @if (d.canEdit) {
            <label class="btn">Nouvelle version<input type="file" class="sr-only" (change)="replace(d, $event)"></label>
            <button type="button" class="btn danger" (click)="remove(d)" aria-label="Supprimer le document">✕</button>
          }
        </div>
      </li>
    }
  </ul>
  @if (msg()) { <p class="ok" role="status">{{ msg() }}</p> }
  @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
  `,
  styles: [`
  :host { display: flex; flex-direction: column; gap: 12px; }
  .add { display: flex; flex-direction: column; gap: 10px; }
  .aud { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted); }
  .aud > span { font-weight: 600; margin-right: 2px; }
  .chip { height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--glass); color: var(--text-muted);
    font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all .15s; display: inline-flex; align-items: center; }
  .chip.on { background: var(--accent-dim); border-color: var(--accent); color: var(--accent-ink); }
  .chip.mini { height: 22px; padding: 0 8px; font-size: 11px; }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .doc { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--glass);
    animation: docIn .3s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--d) * 35ms); }
  @keyframes docIn { from { opacity: 0; transform: translateY(6px); } }
  .ic { flex: none; width: 44px; height: 52px; border-radius: 10px; display: grid; place-items: center; font-size: 11px; font-weight: 800; letter-spacing: .03em;
    background: color-mix(in srgb, var(--text-subtle) 14%, transparent); color: var(--text-secondary); }
  .ic[data-k="PDF"] { background: color-mix(in srgb, var(--rouge-400) 18%, transparent); color: var(--danger); }
  .ic[data-k="IMG"], .ic[data-k="VID"] { background: color-mix(in srgb, var(--bleu-400) 18%, transparent); color: var(--info); }
  .ic[data-k="DOC"], .ic[data-k="PPT"], .ic[data-k="XLS"] { background: var(--accent-dim); color: var(--accent-ink); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .txt b { font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .txt small { font-size: 12px; color: var(--text-muted); }
  .acts { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .btn { height: 34px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary);
    font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; }
  .btn:hover { border-color: var(--accent); }
  .btn.danger:hover { color: var(--danger); border-color: var(--danger); }
  .empty { padding: 26px 20px; text-align: center; border: 1px dashed var(--border); border-radius: 16px; }
  .empty h3 { margin: 0 0 6px; } .empty p { margin: 0; color: var(--text-muted); font-size: 14px; }
  .ok { color: var(--success); font-size: 13.5px; margin: 0; } .err { color: var(--danger); font-size: 13.5px; margin: 0; }
  @media (max-width: 600px) { .doc { flex-wrap: wrap; } .acts { width: 100%; justify-content: flex-start; } }
  `]
})
export class RoomDocsComponent {
  private readonly api = inject(RoomService);
  readonly roomId = input.required<string>();
  readonly canEdit = input(false);
  readonly audiences = ['MARQUE', 'AGENCE_MARKETING', 'REALISATEUR', 'BOITE_PROD'];
  readonly audience = signal<string[]>(['MARQUE', 'AGENCE_MARKETING', 'REALISATEUR', 'BOITE_PROD']);
  readonly docs = signal<RoomDoc[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly msg = signal('');
  readonly error = signal('');

  constructor() { effect(() => { const id = this.roomId(); this.api.documents(id).subscribe({ next: d => { this.docs.set(d); this.loading.set(false); }, error: () => this.loading.set(false) }); }); }

  toggle(a: string): void { this.audience.update(l => l.includes(a) ? l.filter(x => x !== a) : [...l, a]); }
  add(f: File): void { this.run(this.api.upload(this.roomId(), f, this.audience()), `« ${f.name} » partagé.`); }
  replace(d: RoomDoc, ev: Event): void {
    const input = ev.target as HTMLInputElement; const f = input.files?.[0]; input.value = '';
    if (f) this.run(this.api.replace(this.roomId(), d.id, f), `Nouvelle version de « ${d.name} » (v${d.version + 1}).`);
  }
  setAud(d: RoomDoc, a: string): void {
    const next = d.audience.includes(a) ? d.audience.filter(x => x !== a) : [...d.audience, a];
    if (!next.length) { this.error.set('Un document doit rester visible par au moins un rôle.'); return; }
    this.run(this.api.setAudience(this.roomId(), d.id, next), '');
  }
  remove(d: RoomDoc): void { this.run(this.api.deleteDoc(this.roomId(), d.id), `« ${d.name} » supprimé.`); }
  download(d: RoomDoc): void {
    this.api.file(this.roomId(), d.id).subscribe({
      next: b => { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = d.name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); },
      error: () => this.error.set('Téléchargement impossible.')
    });
  }
  private run(o: import('rxjs').Observable<RoomDoc[]>, ok: string): void {
    this.busy.set(true); this.error.set(''); this.msg.set('');
    o.subscribe({ next: d => { this.docs.set(d); this.busy.set(false); this.msg.set(ok); }, error: e => { this.busy.set(false); this.error.set(e.error?.message ?? 'Action impossible.'); } });
  }
  label(a: string): string { return SIDE_LABEL[a] ?? a; }
  kind(d: RoomDoc): string {
    const n = d.name.toLowerCase();
    if (n.endsWith('.pdf')) return 'PDF';
    if (/\.(png|jpe?g|webp)$/.test(n)) return 'IMG';
    if (/\.(mp4|mov)$/.test(n)) return 'VID';
    if (/\.(pptx?|key|odp)$/.test(n)) return 'PPT';
    if (/\.(xlsx?|csv)$/.test(n)) return 'XLS';
    return 'DOC';
  }
  size(b: number): string { return b > 1048576 ? (b / 1048576).toFixed(1) + ' Mo' : Math.max(1, Math.round(b / 1024)) + ' Ko'; }
}
