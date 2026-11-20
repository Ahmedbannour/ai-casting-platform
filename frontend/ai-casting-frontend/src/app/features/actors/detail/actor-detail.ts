import { DropzoneComponent } from '../../../shared/components/dropzone/dropzone';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActorDetailService, ActorDetail } from '../../../core/services/actor-detail.service';
import { frDate, todayIso } from '../../../shared/forms/dates';
import { InvitePanelComponent } from './invite-panel';

type Tab = 'profil' | 'photos' | 'parcours' | 'notes' | 'documents';
type Period = { fromDate: string; toDate: string; note?: string; state: 'passee' | 'en-cours' | 'a-venir'; days: number };

const MAX_DOC = 10 * 1024 * 1024;
const MAX_NOTE = 2000;

/** Fiche acteur : identité, mensurations, disponibilités, photos, parcours, notes internes et documents. */
@Component({
  selector: 'app-actor-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, InvitePanelComponent, DropzoneComponent],
  templateUrl: './actor-detail.html',
  styleUrl: './actor-detail.scss'
})
export class ActorDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly detailService = inject(ActorDetailService);

  readonly actor = signal<ActorDetail | null>(null);
  readonly loading = signal(true);
  readonly revealing = signal(false);
  readonly revealError = signal('');
  readonly error = signal(false);
  readonly tab = signal<Tab>('profil');
  readonly lightbox = signal<number | null>(null);
  /** Élément en attente de confirmation de suppression (« c:<id> » ou « d:<id> »). */
  readonly confirming = signal<string | null>(null);

  newComment = '';
  readonly maxNote = MAX_NOTE;
  readonly addingComment = signal(false);
  readonly commentError = signal('');
  readonly uploading = signal(false);
  readonly docError = signal('');
  readonly dragOver = signal(false);

  readonly frDate = frDate;

  readonly tabs = computed(() => {
    const a = this.actor();
    return [
      { id: 'profil' as Tab, label: 'Profil', n: null as number | null },
      { id: 'photos' as Tab, label: 'Photos', n: a?.photos.length ?? 0 },
      { id: 'parcours' as Tab, label: 'Parcours', n: a?.experiences.length ?? 0 },
      { id: 'notes' as Tab, label: 'Notes', n: a?.comments.length ?? 0 },
      { id: 'documents' as Tab, label: 'Documents', n: a?.documents.length ?? 0 }
    ];
  });

  readonly mainPhoto = computed(() => {
    const a = this.actor();
    if (!a) return null;
    const main = a.photos.find(p => p.isMain) ?? a.photos[0];
    return main?.url || a.mainPhotoUrl || null;
  });

  readonly specs = computed(() => {
    const a = this.actor();
    if (!a) return [];
    return [
      { k: 'Taille', v: a.height ? `${a.height} cm` : '' },
      { k: 'Poids', v: a.weight ? `${a.weight} kg` : '' },
      { k: 'Yeux', v: a.eyeColor || '' },
      { k: 'Cheveux', v: a.hairColor || '' }
    ];
  });

  readonly periods = computed<Period[]>(() => {
    const t = todayIso();
    return [...(this.actor()?.availabilities ?? [])]
      .filter(p => p.fromDate && p.toDate)
      .sort((x, y) => x.fromDate.localeCompare(y.fromDate))
      .map(p => ({
        ...p,
        state: p.toDate < t ? 'passee' : p.fromDate > t ? 'a-venir' : 'en-cours',
        days: Math.round((Date.parse(p.toDate) - Date.parse(p.fromDate)) / 86400000) + 1
      }));
  });
  readonly availableNow = computed(() => this.periods().some(p => p.state === 'en-cours'));
  readonly upcoming = computed(() => this.periods().filter(p => p.state !== 'passee'));

  readonly experiences = computed(() =>
    [...(this.actor()?.experiences ?? [])].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)));

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    const t = this.route.snapshot.queryParamMap.get('onglet') as Tab | null;
    if (t) this.tab.set(t);
    this.detailService.getDetail(id).subscribe({
      next: data => { this.actor.set(data); this.loading.set(false); },
      error: () => { this.error.set(true); this.loading.set(false); }
    });
  }

  initials(): string {
    const a = this.actor();
    return a ? (a.firstName?.[0] ?? '') + (a.lastName?.[0] ?? '') : '';
  }

  place(): string {
    const a = this.actor();
    return [a?.city, a?.country].filter(Boolean).join(', ');
  }

  tel(phone: string): string { return 'tel:' + phone.replace(/[^\d+]/g, ''); }

  stateLabel(p: Period): string {
    return p.state === 'en-cours' ? 'En cours' : p.state === 'a-venir' ? 'À venir' : 'Passée';
  }

  // --- Notes internes ---
  onNoteKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.addComment(); }
  }

  addComment(): void {
    const text = this.newComment.trim();
    const a = this.actor();
    if (!text || !a || this.addingComment()) return;
    if (text.length > MAX_NOTE) { this.commentError.set(`${MAX_NOTE} caractères au plus.`); return; }
    this.addingComment.set(true);
    this.commentError.set('');
    this.detailService.addComment(a.id, text).subscribe({
      next: c => {
        this.actor.update(x => x ? { ...x, comments: [c, ...x.comments] } : x);
        this.newComment = '';
        this.addingComment.set(false);
      },
      error: (e: HttpErrorResponse) => {
        this.addingComment.set(false);
        this.commentError.set(e.error?.message ?? "La note n'a pas pu être enregistrée. Réessayez.");
      }
    });
  }

  deleteComment(id: string): void {
    const a = this.actor();
    if (!a) return;
    this.confirming.set(null);
    this.detailService.deleteComment(a.id, id).subscribe(() =>
      this.actor.update(x => x ? { ...x, comments: x.comments.filter(c => c.id !== id) } : x));
  }

  // --- Documents ---
  uploadDoc(f: File): void { this.upload(f); }

  onDocInput(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) this.upload(f);
    input.value = '';
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragOver.set(false);
    const f = ev.dataTransfer?.files?.[0];
    if (f) this.upload(f);
  }

  private upload(file: File): void {
    const a = this.actor();
    if (!a) return;
    if (file.size > MAX_DOC) { this.docError.set(`« ${file.name} » dépasse 10 Mo.`); return; }
    if (file.size === 0) { this.docError.set(`« ${file.name} » est vide.`); return; }
    this.docError.set('');
    this.uploading.set(true);
    this.detailService.uploadDocument(a.id, file).subscribe({
      next: d => { this.actor.update(x => x ? { ...x, documents: [d, ...x.documents] } : x); this.uploading.set(false); },
      error: (e: HttpErrorResponse) => {
        this.uploading.set(false);
        this.docError.set(e.error?.message ?? "L'envoi a échoué. Réessayez.");
      }
    });
  }

  deleteDocument(id: string): void {
    const a = this.actor();
    if (!a) return;
    this.confirming.set(null);
    this.detailService.deleteDocument(a.id, id).subscribe(() =>
      this.actor.update(x => x ? { ...x, documents: x.documents.filter(d => d.id !== id) } : x));
  }

  docKind(type: string | null, name: string): string {
    const t = (type || '').toLowerCase(), n = (name || '').toLowerCase();
    if (t.includes('pdf') || n.endsWith('.pdf')) return 'PDF';
    if (t.startsWith('image/')) return 'IMG';
    if (t.includes('word') || /\.docx?$/.test(n)) return 'DOC';
    if (t.startsWith('video/')) return 'VID';
    if (t.startsWith('audio/')) return 'SON';
    return 'FIC';
  }

  formatSize(bytes: number): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / 1048576).toFixed(1).replace('.', ',')} Mo`;
  }

  dateTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) + ' à ' +
           d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // --- Visionneuse ---
  openPhoto(i: number): void { this.lightbox.set(i); }
  closePhoto(): void { this.lightbox.set(null); }
  stepPhoto(n: number): void {
    const len = this.actor()?.photos.length ?? 0;
    const i = this.lightbox();
    if (i == null || !len) return;
    this.lightbox.set((i + n + len) % len);
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (this.lightbox() == null) {
      if (e.key === 'Escape') this.confirming.set(null);
      return;
    }
    if (e.key === 'Escape') this.closePhoto();
    else if (e.key === 'ArrowRight') this.stepPhoto(1);
    else if (e.key === 'ArrowLeft') this.stepPhoto(-1);
  }

  edit(): void { this.router.navigate(['/actors', this.actor()!.id, 'edit']); }
  gallery(): void { this.router.navigate(['/actors', this.actor()!.id, 'gallery']); }

  /** T-094 : l'agent demande les coordonnées ; l'acteur verra la consultation. */
  revealContact(a: ActorDetail): void {
    this.revealing.set(true);
    this.revealError.set('');
    this.detailService.revealContact(a.id).subscribe({
      next: c => { this.revealing.set(false); this.actor.set({ ...a, phone: c.phone ?? '', email: c.email ?? '', contactHidden: false }); },
      error: e => {
        this.revealing.set(false);
        this.revealError.set(e?.error?.code === 'CONTRAT_INACTIF' ? 'Contrat inactif : coordonnées indisponibles.' : 'Coordonnées indisponibles. Réessayez.');
      }
    });
  }
}
