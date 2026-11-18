import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { SelectFieldComponent } from '../../shared/components/select-field/select-field';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { DashboardService, DashboardStats } from '../../core/services/dashboard.service';
import { ActorService, ActorSummary } from '../../core/services/actor.service';

type View = 'grille' | 'liste';
interface Chip { key: 'search' | 'gender' | 'age' | 'city' | 'height' | 'lang' | 'skill'; label: string; value?: string; }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, SelectFieldComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements OnInit {

  private readonly dashboardService = inject(DashboardService);
  private readonly actorService = inject(ActorService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  stats = signal<DashboardStats>({ totalActors: 0, totalPhotos: 0, totalSearches: 0, totalDocuments: 0 });
  actors = signal<ActorSummary[]>([]);
  loading = signal(true);
  /** Photos qui n'ont pas pu être chargées : on affiche les initiales à la place. */
  brokenPhotos = signal<Set<string>>(new Set());
  view = signal<View>(readView());

  // Filtres (appliqués automatiquement pendant la saisie)
  search = '';
  gender = '';
  minAge: number | null = null;
  maxAge: number | null = null;
  city = '';
  // T-117 · Filtres avancés
  minHeight: number | null = null;
  maxHeight: number | null = null;
  languages = signal<string[]>([]);
  skills = signal<string[]>([]);
  facetLangs = signal<string[]>([]);
  facetSkills = signal<string[]>([]);
  skillQuery = signal('');
  moreOpen = signal(false);
  moreCount = computed(() => this.languages().length + this.skills().length);
  shownSkills = computed(() => {
    const q = this.skillQuery().trim().toLowerCase();
    const all = this.facetSkills();
    return (q ? all.filter(s => s.toLowerCase().includes(q)) : all).slice(0, q ? 40 : 18);
  });
  private readonly typing = new Subject<void>();

  // Tri et pagination
  sortBy = 'lastName';
  sortDir: 'asc' | 'desc' = 'asc';
  page = 0;
  size = 24;
  totalElements = 0;
  totalPages = 0;

  readonly genders = [
    { value: '', label: 'Tous' },
    { value: 'Femme', label: 'Femmes' },
    { value: 'Homme', label: 'Hommes' }
  ];

  readonly sizeOptions = [12, 24, 48, 96].map(n => ({ value: n, label: String(n) }));
  readonly sorts = [
    { value: 'lastName:asc', label: 'Nom, A → Z' },
    { value: 'lastName:desc', label: 'Nom, Z → A' },
    { value: 'age:asc', label: 'Plus jeunes d’abord' },
    { value: 'age:desc', label: 'Plus âgés d’abord' },
    { value: 'city:asc', label: 'Ville' },
    { value: 'height:desc', label: 'Plus grands d’abord' }
  ];

  /** Filtres actifs, affichés en pastilles que l'on peut retirer une à une. */
  chips = signal<Chip[]>([]);
  hasFilters = computed(() => this.chips().length > 0);

  ngOnInit(): void {
    this.dashboardService.getStats().subscribe({ next: s => this.stats.set(s), error: () => {} });
    this.typing.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.applyFilters());
    this.actorService.facets().subscribe({ next: f => { this.facetLangs.set(f.languages); this.facetSkills.set(f.skills); }, error: () => {} });
    this.loadActors();
  }

  toggleMore(): void { this.moreOpen.update(v => !v); }

  toggleTag(kind: 'lang' | 'skill', v: string): void {
    const s = kind === 'lang' ? this.languages : this.skills;
    s.update(l => l.includes(v) ? l.filter(x => x !== v) : [...l, v].slice(0, 10));
    this.applyFilters();
  }

  isOn(kind: 'lang' | 'skill', v: string): boolean { return (kind === 'lang' ? this.languages() : this.skills()).includes(v); }

  /** Message si la tranche de taille saisie ne peut pas filtrer. */
  heightError(): string {
    const lo = this.ageValue(this.minHeight), hi = this.ageValue(this.maxHeight);
    const bad = (n?: number) => n !== undefined && (!Number.isInteger(n) || n < 50 || n > 250);
    if (bad(lo) || bad(hi)) return 'Taille : entre 50 et 250 cm';
    if (lo !== undefined && hi !== undefined && lo > hi) return 'Taille minimum supérieure au maximum';
    return '';
  }

  get sortKey(): string { return `${this.sortBy}:${this.sortDir}`; }
  set sortKey(v: string) {
    const [by, dir] = v.split(':');
    this.sortBy = by;
    this.sortDir = dir as 'asc' | 'desc';
    this.page = 0;
    this.loadActors();
  }

  loadActors(): void {
    this.loading.set(true);
    this.actorService.searchAdvanced(
      this.search.trim() || undefined,
      this.gender || undefined,
      // Tranche d'âge incohérente : ignorée (le message l'explique) plutôt que de renvoyer une liste vide.
      this.ageError() ? undefined : this.ageValue(this.minAge),
      this.ageError() ? undefined : this.ageValue(this.maxAge),
      this.city.trim() || undefined,
      this.page, this.size, this.sortBy, this.sortDir,
      {
        minHeight: this.heightError() ? undefined : this.ageValue(this.minHeight),
        maxHeight: this.heightError() ? undefined : this.ageValue(this.maxHeight),
        languages: this.languages(), skills: this.skills()
      }
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

  private ageValue(v: number | null): number | undefined {
    return v === null || v === undefined || (v as unknown) === '' ? undefined : +v;
  }

  /** Message si la tranche d'âge saisie ne peut pas filtrer. */
  ageError(): string {
    const lo = this.ageValue(this.minAge), hi = this.ageValue(this.maxAge);
    const bad = (n?: number) => n !== undefined && (!Number.isInteger(n) || n < 0 || n > 120);
    if (bad(lo) || bad(hi)) return 'Âge : nombre entier entre 0 et 120';
    if (lo !== undefined && hi !== undefined && lo > hi) return 'Âge minimum supérieur au maximum';
    return '';
  }

  /** Saisie libre (nom, ville, âges) : on attend 300 ms sans frappe avant de chercher. */
  onTyping(): void { this.typing.next(); }

  setGender(g: string): void {
    if (this.gender === g) return;
    this.gender = g;
    this.applyFilters();
  }

  applyFilters(): void {
    this.page = 0;
    this.chips.set(this.buildChips());
    this.loadActors();
  }

  removeChip(key: Chip['key']): void {
    if (key === 'search') this.search = '';
    if (key === 'gender') this.gender = '';
    if (key === 'age') { this.minAge = null; this.maxAge = null; }
    if (key === 'city') this.city = '';
    if (key === 'height') { this.minHeight = null; this.maxHeight = null; }
    this.applyFilters();
  }

  removeTagChip(c: Chip): void {
    if (c.key === 'lang' || c.key === 'skill') this.toggleTag(c.key, c.value!); else this.removeChip(c.key);
  }

  resetFilters(): void {
    this.search = ''; this.gender = ''; this.minAge = null; this.maxAge = null; this.city = '';
    this.minHeight = null; this.maxHeight = null; this.languages.set([]); this.skills.set([]);
    this.applyFilters();
  }

  setView(v: View): void {
    this.view.set(v);
    try { localStorage.setItem('casting_dashboard_view', v); } catch { /* stockage indisponible */ }
  }

  sort(key: string): void {
    if (this.sortBy === key) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    else { this.sortBy = key; this.sortDir = 'asc'; }
    this.page = 0;
    this.loadActors();
  }

  sortMark(key: string): string {
    if (this.sortBy !== key) return '';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  changeSize(size: number): void {
    this.size = +size;
    this.page = 0;
    this.loadActors();
  }

  goToPage(p: number): void {
    if (p < 0 || p >= this.totalPages || p === this.page) return;
    this.page = p;
    this.loadActors();
  }

  get pages(): number[] {
    const range: number[] = [];
    for (let i = Math.max(0, this.page - 2); i <= Math.min(this.totalPages - 1, this.page + 2); i++) range.push(i);
    return range;
  }

  get rangeLabel(): string {
    if (!this.totalElements) return '0 acteur';
    const from = this.page * this.size + 1;
    const to = Math.min(this.totalElements, from + this.actors().length - 1);
    return `${from}–${to} sur ${this.totalElements}`;
  }

  /** Photo principale en taille suffisante pour la grille (les miniatures de 48 px seraient floues). */
  photo(a: ActorSummary): string | null {
    const url = a.mainPhotoUrl?.replace('/api/portraits/thumb/', '/api/portraits/');
    return url && !this.brokenPhotos().has(url) ? url : null;
  }

  onPhotoError(url: string): void {
    this.brokenPhotos.update(s => new Set(s).add(url));
  }

  initials(a: ActorSummary): string {
    return ((a.firstName?.[0] ?? '') + (a.lastName?.[0] ?? '')).toUpperCase();
  }

  goToCreate(): void { this.router.navigate(['/actors/new']); }
  onView(id: string): void { this.router.navigate(['/actors', id]); }
  onEdit(id: string): void { this.router.navigate(['/actors', id, 'edit']); }
  onGallery(id: string): void { this.router.navigate(['/actors', id, 'gallery']); }

  onDelete(a: ActorSummary): void {
    if (!confirm(`Supprimer ${a.firstName} ${a.lastName} ? Cette action est définitive.`)) return;
    this.actorService.delete(a.id).subscribe(() => {
      this.loadActors();
      this.dashboardService.getStats().subscribe({ next: s => this.stats.set(s), error: () => {} });
    });
  }

  private buildChips(): Chip[] {
    const c: Chip[] = [];
    if (this.search.trim()) c.push({ key: 'search', label: `« ${this.search.trim()} »` });
    if (this.gender) c.push({ key: 'gender', label: this.gender === 'Femme' ? 'Femmes' : 'Hommes' });
    if (this.minAge != null || this.maxAge != null) {
      const lo = this.minAge ?? '…', hi = this.maxAge ?? '…';
      c.push({ key: 'age', label: `${lo} à ${hi} ans` });
    }
    if (this.city.trim()) c.push({ key: 'city', label: this.city.trim() });
    if (this.minHeight != null || this.maxHeight != null) {
      c.push({ key: 'height', label: `${this.minHeight ?? '…'} à ${this.maxHeight ?? '…'} cm` });
    }
    for (const l of this.languages()) c.push({ key: 'lang', label: l, value: l });
    for (const k of this.skills()) c.push({ key: 'skill', label: k, value: k });
    return c;
  }
}

function readView(): View {
  try { return localStorage.getItem('casting_dashboard_view') === 'liste' ? 'liste' : 'grille'; } catch { return 'grille'; }
}
