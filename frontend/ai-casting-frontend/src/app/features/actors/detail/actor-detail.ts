import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ActorDetailService, ActorDetail, CommentDto } from '../../../core/services/actor-detail.service';

type Tab = 'info' | 'gallery' | 'experiences' | 'comments' | 'documents';

@Component({
  selector: 'app-actor-detail',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './actor-detail.html',
  styleUrl: './actor-detail.scss'
})
export class ActorDetailComponent implements OnInit {

  actor = signal<ActorDetail | null>(null);
  loading = signal(true);
  activeTab = signal<Tab>('info');
  newComment = '';
  addingComment = signal(false);
  error = signal(false);

  tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'info', label: 'Informations', icon: '👤' },
    { key: 'gallery', label: 'Galerie', icon: '📷' },
    { key: 'experiences', label: 'Expériences', icon: '🎬' },
    { key: 'comments', label: 'Commentaires', icon: '💬' },
    { key: 'documents', label: 'Documents', icon: '📄' }
  ];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private detailService: ActorDetailService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.detailService.getDetail(id).subscribe({
      next: (data) => {
        this.actor.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Detail error:', err);
        this.error.set(true);
        this.loading.set(false);
      }
    });
  }

  setTab(tab: Tab): void { this.activeTab.set(tab); }

  addComment(): void {
    if (!this.newComment.trim() || !this.actor()) return;
    this.addingComment.set(true);
    this.detailService.addComment(this.actor()!.id, this.newComment).subscribe({
      next: (comment) => {
        this.actor.update(a => a ? ({
          ...a, comments: [comment, ...a.comments]
        }) : a);
        this.newComment = '';
        this.addingComment.set(false);
      },
      error: () => this.addingComment.set(false)
    });
  }

  deleteComment(commentId: string): void {
    if (!this.actor()) return;
    this.detailService.deleteComment(this.actor()!.id, commentId).subscribe(() => {
      this.actor.update(a => a ? ({
        ...a, comments: a.comments.filter(c => c.id !== commentId)
      }) : a);
    });
  }

  onDocumentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !this.actor()) return;
    const file = input.files[0];
    this.detailService.uploadDocument(this.actor()!.id, file).subscribe({
      next: (doc) => {
        this.actor.update(a => a ? ({
          ...a, documents: [doc, ...a.documents]
        }) : a);
      }
    });
  }

  deleteDocument(docId: string): void {
    if (!this.actor()) return;
    this.detailService.deleteDocument(this.actor()!.id, docId).subscribe(() => {
      this.actor.update(a => a ? ({
        ...a, documents: a.documents.filter(d => d.id !== docId)
      }) : a);
    });
  }

  edit(): void { this.router.navigate(['/actors', this.actor()!.id, 'edit']); }
  gallery(): void { this.router.navigate(['/actors', this.actor()!.id, 'gallery']); }
  back(): void { this.router.navigate(['/dashboard']); }

  formatSize(bytes: number): string {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  getInitials(): string {
    const a = this.actor();
    if (!a) return '';
    return a.firstName[0] + a.lastName[0];
  }
}
