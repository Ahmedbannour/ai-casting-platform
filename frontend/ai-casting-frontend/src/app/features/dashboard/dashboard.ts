import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DashboardService, DashboardStats } from '../../core/services/dashboard.service';
import { ActorService, ActorSummary } from '../../core/services/actor.service';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card';
import { ActorCardComponent } from '../../shared/components/actor-card/actor-card';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, StatCardComponent, ActorCardComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements OnInit {

  stats = signal<DashboardStats>({ totalActors: 0, totalPhotos: 0, totalSearches: 0, totalDocuments: 0 });
  actors = signal<ActorSummary[]>([]);
  loading = signal(true);
  search = '';

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
    this.actorService.findAll(this.search || undefined).subscribe({
      next: (page) => {
        this.actors.set(page.content);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onSearch(): void {
    this.loadActors();
  }

  goToCreate(): void {
    this.router.navigate(['/actors/new']);
  }

  onView(id: string): void {
    this.router.navigate(['/actors', id]);
  }

  onEdit(id: string): void {
    this.router.navigate(['/actors', id, 'edit']);
  }

  onDelete(id: string): void {
    if (confirm('Supprimer cet acteur ?')) {
      this.actorService.delete(id).subscribe(() => this.loadActors());
    }
  }

  onGallery(id: string): void {
  this.router.navigate(['/actors', id, 'gallery']);
}
}
