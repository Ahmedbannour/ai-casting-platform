import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DashboardService, DashboardStats } from '../../core/services/dashboard.service';
import { ActorService, ActorSummary } from '../../core/services/actor.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements OnInit {

  stats = signal<DashboardStats>({ totalActors: 0, totalPhotos: 0, totalSearches: 0, totalDocuments: 0 });
  actors = signal<ActorSummary[]>([]);
  loading = signal(true);

  // Filters
  search = '';
  gender = '';
  minAge: number | null = null;
  maxAge: number | null = null;
  city = '';

  // Sort
  sortBy = 'lastName';
  sortDir = 'asc';

  // Pagination
  page = 0;
  size = 20;
  totalElements = 0;
  totalPages = 0;

  // Column sort state
  columns = [
    { key: 'mainPhotoUrl', label: 'Photo', sortable: false },
    { key: 'firstName', label: 'Nom', sortable: true },
    { key: 'age', label: 'Âge', sortable: true },
    { key: 'gender', label: 'Genre', sortable: true },
    { key: 'city', label: 'Ville', sortable: true },
    { key: 'height', label: 'Taille', sortable: true },
    { key: 'actions', label: 'Actions', sortable: false }
  ];

  constructor(
    private dashboardService: DashboardService,
    private actorService: ActorService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadActors();
  }

  loadStats(): void {
    this.dashboardService.getStats().subscribe(data => this.stats.set(data));
  }

  loadActors(): void {
    this.loading.set(true);
    this.actorService.searchAdvanced(
      this.search || undefined,
      this.gender || undefined,
      this.minAge ?? undefined,
      this.maxAge ?? undefined,
      this.city || undefined,
      this.page,
      this.size,
      this.sortBy,
      this.sortDir
    ).subscribe({
      next: (page) => {
        this.actors.set(page.content);
        this.totalElements = page.totalElements;
        this.totalPages = page.totalPages;
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  applyFilters(): void {
    this.page = 0;
    this.loadActors();
  }

  resetFilters(): void {
    this.search = '';
    this.gender = '';
    this.minAge = null;
    this.maxAge = null;
    this.city = '';
    this.sortBy = 'lastName';
    this.sortDir = 'asc';
    this.page = 0;
    this.loadActors();
  }

  sort(key: string): void {
    if (this.sortBy === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = key;
      this.sortDir = 'asc';
    }
    this.page = 0;
    this.loadActors();
  }

  getSortIcon(key: string): string {
    if (this.sortBy !== key) return '↕';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  prevPage(): void {
    if (this.page > 0) { this.page--; this.loadActors(); }
  }

  nextPage(): void {
    if (this.page < this.totalPages - 1) { this.page++; this.loadActors(); }
  }

  goToPage(p: number): void {
    this.page = p;
    this.loadActors();
  }

  get pages(): number[] {
    const total = this.totalPages;
    const current = this.page;
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(0, current - delta);
         i <= Math.min(total - 1, current + delta); i++) {
      range.push(i);
    }
    return range;
  }

  goToCreate(): void { this.router.navigate(['/actors/new']); }
  onView(id: string): void { this.router.navigate(['/actors', id]); }
  onEdit(id: string): void { this.router.navigate(['/actors', id, 'edit']); }
  onGallery(id: string): void { this.router.navigate(['/actors', id, 'gallery']); }

  onDelete(id: string): void {
    if (!confirm('Supprimer cet acteur ?')) return;
    this.actorService.delete(id).subscribe(() => this.loadActors());
  }
}
