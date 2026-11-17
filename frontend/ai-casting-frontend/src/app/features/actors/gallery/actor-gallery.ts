import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PhotoService, PhotoResponse } from '../../../core/services/photo.service';
import { ActorService } from '../../../core/services/actor.service';
import { MeService } from '../../../core/services/me.service';
import { PhotoUploadComponent } from '../../../shared/components/photo-upload/photo-upload';

/** Galerie d'un acteur : ajout, photo principale, suppression confirmée dans la carte. */
@Component({
  selector: 'app-actor-gallery',
  standalone: true,
  imports: [RouterLink, PhotoUploadComponent],
  templateUrl: './actor-gallery.html',
  styleUrl: './actor-gallery.scss'
})
export class ActorGalleryComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly photoService = inject(PhotoService);
  private readonly actors = inject(ActorService);
  private readonly meService = inject(MeService);

  /** « Mes photos » de l'acteur freelance. */
  readonly self = !!this.route.snapshot.data['self'];

  readonly actorId = signal('');
  readonly actorName = signal('');
  readonly photos = signal<PhotoResponse[]>([]);
  readonly loading = signal(true);
  readonly confirming = signal<string | null>(null);
  readonly busy = signal<string | null>(null);
  readonly error = signal('');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.actorId.set(id);
    if (!this.self) this.actors.findById(id).subscribe({ next: a => this.actorName.set(`${a.firstName} ${a.lastName}`), error: () => {} });
    (this.self ? this.meService.photos() : this.photoService.findAll(id)).subscribe({
      next: p => { this.photos.set(p); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger les photos.'); }
    });
  }

  onUploaded(newPhotos: PhotoResponse[]): void {
    this.photos.update(cur => {
      const all = [...newPhotos, ...cur];
      // Première photo d'un dossier vide : le serveur la marque principale ; on reflète l'état.
      return all;
    });
  }

  setMain(p: PhotoResponse): void {
    if (p.isMain || this.busy()) return;
    this.busy.set(p.id);
    (this.self ? this.meService.setMain(p.id) : this.photoService.setMain(this.actorId(), p.id)).subscribe({
      next: () => { this.photos.update(list => list.map(x => ({ ...x, isMain: x.id === p.id }))); this.busy.set(null); },
      error: () => { this.busy.set(null); this.error.set("La photo principale n'a pas pu être changée."); }
    });
  }

  remove(p: PhotoResponse): void {
    this.confirming.set(null);
    this.busy.set(p.id);
    (this.self ? this.meService.deletePhoto(p.id) : this.photoService.delete(this.actorId(), p.id)).subscribe({
      next: () => { this.photos.update(list => list.filter(x => x.id !== p.id)); this.busy.set(null); },
      error: () => { this.busy.set(null); this.error.set("La photo n'a pas pu être supprimée."); }
    });
  }

  size(bytes: number): string {
    if (!bytes) return '';
    return bytes < 1048576 ? `${Math.round(bytes / 1024)} Ko` : `${(bytes / 1048576).toFixed(1).replace('.', ',')} Mo`;
  }

  @HostListener('document:keydown.escape')
  cancelConfirm(): void { this.confirming.set(null); }
}
