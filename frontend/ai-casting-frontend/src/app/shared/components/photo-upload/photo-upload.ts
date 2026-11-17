import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { PhotoService, PhotoResponse } from '../../../core/services/photo.service';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE = 10 * 1024 * 1024;
const MAX_BATCH = 50 * 1024 * 1024;

/** Zone de dépôt de photos : contrôle type et poids avant l'envoi, comme le serveur. */
@Component({
  selector: 'app-photo-upload',
  standalone: true,
  template: `
  <label class="drop" [class.over]="dragOver()" [class.busy]="uploading()"
         (dragover)="onDragOver($event)" (dragleave)="dragOver.set(false)" (drop)="onDrop($event)">
    <input type="file" class="sr-only" multiple accept="image/jpeg,image/png,image/webp"
           [disabled]="uploading()" (change)="onFileSelected($event)" />
    @if (uploading()) {
      <span class="spin" aria-hidden="true"></span>
      <b>Envoi de {{ pending() }} photo{{ pending() > 1 ? 's' : '' }}…</b>
    } @else {
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 8"/></svg>
      <b>Déposez des photos ou <u>parcourez</u></b>
      <small>JPEG, PNG ou WebP · 10 Mo par photo</small>
    }
  </label>
  @for (m of rejected(); track $index) { <small class="field-msg" role="alert">{{ m }}</small> }
  @if (error()) { <small class="field-msg" role="alert">{{ error() }}</small> }
  @if (done()) { <small class="ok" role="status">{{ done() }}</small> }
  `,
  styles: [`
  :host { display: flex; flex-direction: column; gap: 6px; }
  .drop { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 30px 20px; text-align: center; cursor: pointer;
    border: 1.5px dashed var(--border); border-radius: var(--radius-m); background: var(--glass); color: var(--text-muted);
    transition: border-color .15s, background .15s; }
  .drop svg { width: 28px; height: 28px; fill: none; stroke: var(--text-subtle); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; transition: transform .2s, stroke .15s; }
  .drop b { color: var(--text-primary); font-size: 14.5px; font-weight: 600; }
  .drop u { color: var(--accent); text-underline-offset: 3px; }
  .drop small { font-size: 12.5px; color: var(--text-subtle); }
  .drop:hover, .drop.over { border-color: var(--accent); background: var(--accent-dim); }
  .drop:hover svg, .drop.over svg { transform: translateY(-3px); stroke: var(--accent); }
  .drop:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
  .drop.busy { cursor: progress; }
  .spin { width: 24px; height: 24px; border-radius: 50%; border: 2.5px solid var(--border); border-top-color: var(--accent); animation: spin .8s linear infinite; }
  .ok { color: var(--text-muted); font-size: 12.5px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class PhotoUploadComponent {
  @Input() actorId!: string;
  @Output() uploaded = new EventEmitter<PhotoResponse[]>();

  readonly uploading = signal(false);
  readonly dragOver = signal(false);
  readonly error = signal('');
  readonly rejected = signal<string[]>([]);
  readonly done = signal('');
  readonly pending = signal(0);

  constructor(private photoService: PhotoService) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) this.uploadFiles(Array.from(input.files));
    input.value = '';
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    this.uploadFiles(Array.from(event.dataTransfer?.files || []));
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  private uploadFiles(files: File[]): void {
    this.error.set(''); this.done.set('');
    const refused: string[] = [];
    const ok: File[] = [];
    let total = 0;
    for (const f of files) {
      if (!TYPES.includes(f.type)) refused.push(`« ${f.name} » refusée : JPEG, PNG ou WebP uniquement.`);
      else if (f.size > MAX_FILE) refused.push(`« ${f.name} » refusée : ${(f.size / 1048576).toFixed(1).replace('.', ',')} Mo, 10 Mo au plus.`);
      else if (total + f.size > MAX_BATCH) refused.push(`« ${f.name} » non envoyée : 50 Mo au plus par envoi, ajoutez-la ensuite.`);
      else { ok.push(f); total += f.size; }
    }
    this.rejected.set(refused);
    if (!ok.length) return;

    this.uploading.set(true);
    this.pending.set(ok.length);
    this.photoService.upload(this.actorId, ok).subscribe({
      next: res => {
        this.uploading.set(false);
        this.done.set(`${res.photos.length} photo${res.photos.length > 1 ? 's ajoutées' : ' ajoutée'}.`);
        this.uploaded.emit(res.photos);
      },
      error: (e: HttpErrorResponse) => {
        this.uploading.set(false);
        this.error.set(e.error?.message ?? "L'envoi a échoué. Vérifiez votre connexion et réessayez.");
      }
    });
  }
}
