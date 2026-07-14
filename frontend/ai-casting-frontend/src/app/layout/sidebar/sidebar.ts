import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';
import { AiSearchAngularService, HistoryItem } from '../../core/services/ai-search.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss'
})
export class SidebarComponent implements OnInit {

  history = signal<HistoryItem[]>([]);

  constructor(
    public themeService: ThemeService,
    private aiService: AiSearchAngularService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadHistory();
  }

  loadHistory(): void {
    this.aiService.getHistory(8).subscribe({
      next: (h) => this.history.set(h),
      error: () => {}
    });
  }

  newChat(): void {
    this.router.navigate(['/chat']);
  }

  logout(): void {
    this.authService.logout();
  }
}
