import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PhotoService, PhotoResponse } from '../../../core/services/photo.service';

@Component({
  selector: 'app-photo-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './photo-upload.html',
  styleUrl: './photo-upload.scss'
})
export class PhotoUploadComponent {

  @Input() actorId!: string;
  @Output() uploaded = new EventEmitter<PhotoResponse[]>();

  uploading = signal(false);
  dragOver = signal(false);
  error = signal('');

  constructor(private photoService: PhotoService) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.uploadFiles(Array.from(input.files));
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const files = Array.from(event.dataTransfer?.files || [])
      .filter(f => f.type.startsWith('image/'));
    if (files.length) this.uploadFiles(files);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(): void {
    this.dragOver.set(false);
  }

  private uploadFiles(files: File[]): void {
    this.uploading.set(true);
    this.error.set('');

    this.photoService.upload(this.actorId, files).subscribe({
      next: (res) => {
        this.uploading.set(false);
        this.uploaded.emit(res.photos);
      },
      error: () => {
        this.uploading.set(false);
        this.error.set('Erreur lors de l\'upload');
      }
    });
  }
}
