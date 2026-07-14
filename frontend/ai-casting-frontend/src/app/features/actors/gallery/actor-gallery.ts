import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { PhotoService, PhotoResponse } from '../../../core/services/photo.service';
import { PhotoUploadComponent } from '../../../shared/components/photo-upload/photo-upload';

@Component({
  selector: 'app-actor-gallery',
  standalone: true,
  imports: [CommonModule, PhotoUploadComponent],
  templateUrl: './actor-gallery.html',
  styleUrl: './actor-gallery.scss'
})
export class ActorGalleryComponent implements OnInit {

  actorId = signal('');
  photos = signal<PhotoResponse[]>([]);
  loading = signal(true);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private photoService: PhotoService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.actorId.set(id);
    this.loadPhotos();
  }

  loadPhotos(): void {
    this.loading.set(true);
    this.photoService.findAll(this.actorId()).subscribe({
      next: (photos) => {
        this.photos.set(photos);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onUploaded(newPhotos: PhotoResponse[]): void {
    this.photos.update(current => [...newPhotos, ...current]);
  }

  setMain(photoId: string): void {
    this.photoService.setMain(this.actorId(), photoId).subscribe(() => {
      this.photos.update(photos =>
        photos.map(p => ({ ...p, isMain: p.id === photoId }))
      );
    });
  }

  delete(photoId: string): void {
    if (!confirm('Supprimer cette photo ?')) return;
    this.photoService.delete(this.actorId(), photoId).subscribe(() => {
      this.photos.update(photos => photos.filter(p => p.id !== photoId));
    });
  }

  back(): void {
    this.router.navigate(['/dashboard']);
  }
}
