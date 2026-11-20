import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MeService } from '../../../core/services/me.service';
import { todayIso } from '../../../shared/forms/dates';

interface Check { key: string; label: string; tip: string; weight: number; ok: boolean; section?: string; photos?: boolean; }

/**
 * T-097 · Score de complétude du profil acteur, avec les conseils qui rapportent le plus.
 * Calculé sur la fiche enregistrée (pas sur le formulaire en cours de saisie).
 */
@Component({
  selector: 'app-profile-score',
  standalone: true,
  imports: [RouterLink],
  template: `
  @if (loaded()) {
    <section class="score" aria-labelledby="ps-t">
      <div class="gauge" [style.--p]="score()" role="img" [attr.aria-label]="'Profil complet à ' + score() + ' %'">
        <svg viewBox="0 0 36 36" aria-hidden="true">
          <circle class="track" cx="18" cy="18" r="15.9" />
          <circle class="bar" cx="18" cy="18" r="15.9" pathLength="100" [attr.stroke-dasharray]="score() + ' 100'" />
        </svg>
        <b>{{ score() }}<small>%</small></b>
      </div>
      <div class="txt">
        <h2 id="ps-t">{{ headline() }}</h2>
        @if (todo().length) {
          <p>Les fiches complètes ressortent en tête des recherches des agences. À compléter en priorité :</p>
          <ul>
            @for (c of todo().slice(0, 3); track c.key) {
              <li>
                @if (c.photos) { <a routerLink="/mon-profil/photos">{{ c.label }}</a> }
                @else { <button type="button" (click)="goTo(c.section)">{{ c.label }}</button> }
                <span>{{ c.tip }}</span>
              </li>
            }
          </ul>
        } @else {
          <p>Tout y est. Pensez seulement à garder vos disponibilités à jour.</p>
        }
      </div>
    </section>
  }
  `,
  styles: [`
  :host { display: block; margin-top: 12px; }
  .score { display: flex; gap: 18px; align-items: flex-start; padding: 16px 18px; border-radius: var(--radius-l); border: 1px solid var(--border);
    background: var(--glass); -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }
  .gauge { position: relative; flex: none; width: 78px; height: 78px; display: grid; place-items: center;
    svg { position: absolute; inset: 0; transform: rotate(-90deg); }
    circle { fill: none; stroke-width: 3.2; }
    .track { stroke: var(--bg-hover); }
    .bar { stroke: var(--accent); stroke-linecap: round; transition: stroke-dasharray .8s cubic-bezier(.2,.8,.2,1); }
    b { font-size: 21px; font-weight: 800; font-variant-numeric: tabular-nums; small { font-size: 12px; font-weight: 600; color: var(--text-muted); } } }
  .txt { min-width: 0; }
  h2 { font-size: 18px; font-stretch: 100%; }
  p { margin-top: 4px; font-size: 13.5px; color: var(--text-muted); line-height: 1.5; }
  ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; font-size: 13.5px;
    a, button { border: none; background: none; padding: 0; color: var(--accent-ink); font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; }
    a:hover, button:hover { text-decoration: underline; }
    span { color: var(--text-muted); font-size: 12.5px; } }
  @container page (max-width: 560px) { .score { flex-direction: column; align-items: center; text-align: center; } li { justify-content: center; } }
  @media (prefers-reduced-motion: reduce) { .gauge .bar { transition: none; } }
  `]
})
export class ProfileScoreComponent implements OnInit {
  private readonly me = inject(MeService);
  readonly loaded = signal(false);
  readonly checks = signal<Check[]>([]);

  readonly score = computed(() => {
    const all = this.checks(), total = all.reduce((s, c) => s + c.weight, 0);
    return total ? Math.round(all.filter(c => c.ok).reduce((s, c) => s + c.weight, 0) / total * 100) : 0;
  });
  readonly todo = computed(() => this.checks().filter(c => !c.ok).sort((a, b) => b.weight - a.weight));
  readonly headline = computed(() => {
    const s = this.score();
    return s === 100 ? 'Profil complet' : s >= 70 ? 'Presque complet' : s >= 40 ? 'Profil à étoffer' : 'Profil à compléter';
  });

  ngOnInit(): void { this.refresh(); }

  /** Relu après chaque enregistrement de la fiche. */
  refresh(): void {
    forkJoin({ a: this.me.actor(), p: this.me.photos() }).subscribe({
      next: ({ a, p }) => {
        const x = a as any, today = todayIso();
        this.checks.set([
          { key: 'main', label: 'Ajouter une photo principale', tip: 'C’est la première chose que voit une agence.', weight: 20, ok: p.some(ph => ph.isMain), photos: true },
          { key: 'photos', label: 'Avoir au moins 3 photos', tip: 'Portrait, plan américain, en pied.', weight: 10, ok: p.length >= 3, photos: true },
          { key: 'birth', label: 'Renseigner la date de naissance', tip: 'Les rôles sont filtrés par âge.', weight: 12, ok: !!x.birthDate, section: 'identite' },
          { key: 'city', label: 'Indiquer votre ville', tip: 'Beaucoup de recherches précisent un lieu.', weight: 8, ok: !!x.city, section: 'identite' },
          { key: 'height', label: 'Indiquer votre taille', tip: 'Utile pour les rôles physiques.', weight: 6, ok: !!x.height, section: 'physique' },
          { key: 'bio', label: 'Écrire une biographie d’au moins 3 lignes', tip: 'Formation, registres de jeu, ce qui vous distingue.', weight: 12, ok: (x.bio ?? '').trim().length >= 120, section: 'physique' },
          { key: 'lang', label: 'Ajouter vos langues', tip: 'Avec le niveau : les agences cherchent souvent « bilingue ».', weight: 10, ok: (x.languages ?? []).length > 0, section: 'talents' },
          { key: 'skill', label: 'Ajouter vos compétences', tip: 'Danse, chant, cascades, accents…', weight: 8, ok: (x.skills ?? []).length > 0, section: 'talents' },
          { key: 'exp', label: 'Ajouter une expérience', tip: 'Même un court métrage ou une pièce d’école.', weight: 8, ok: (x.experiences ?? []).length > 0, section: 'parcours' },
          { key: 'dispo', label: 'Déclarer vos disponibilités', tip: 'Elles sont comparées aux dates de tournage.', weight: 6, ok: (x.availabilities ?? []).some((v: any) => v.toDate >= today), section: 'dispos' }
        ]);
        this.loaded.set(true);
        this.scrollToFragment();
      },
      error: () => this.loaded.set(false)
    });
  }

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  goTo(section?: string): void {
    if (!section) return;
    const el = document.getElementById(section);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else this.router.navigate(['/mon-profil'], { fragment: section });   // depuis « Mon espace »
  }

  /** Arrivée sur le formulaire avec une rubrique demandée (#physique, #talents…). */
  private scrolled = false;
  private scrollToFragment(): void {
    if (this.scrolled) return;
    this.scrolled = true;
    const f = this.route.snapshot.fragment;
    if (f) setTimeout(() => document.getElementById(f)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  }
}
