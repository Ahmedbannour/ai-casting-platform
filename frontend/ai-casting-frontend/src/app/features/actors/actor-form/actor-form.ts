import { Component, DestroyRef, ElementRef, OnInit, afterRenderEffect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ActorService } from '../../../core/services/actor.service';
import { DateFieldComponent } from '../../../shared/components/date-field/date-field';
import { SelectFieldComponent, SelectOption } from '../../../shared/components/select-field/select-field';
import { ageAt, frDate, todayIso } from '../../../shared/forms/dates';
import { RULES, email, errorMessage, intBetween, noOverlap, notBlank, periodOrder, personName, phone, uniqueNames } from '../../../shared/forms/rules';

type SectionId = 'identite' | 'physique' | 'talents' | 'parcours' | 'dispos';

/** Création / modification d'un acteur, avec contrôles en direct alignés sur ceux du serveur. */
@Component({
  selector: 'app-actor-form',
  standalone: true,
  imports: [ReactiveFormsModule, DateFieldComponent, SelectFieldComponent],
  templateUrl: './actor-form.html',
  styleUrl: './actor-form.scss'
})
export class ActorFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly actorService = inject(ActorService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  form!: FormGroup;
  readonly isEdit = signal(false);
  readonly actorId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loaded = signal(true);
  readonly error = signal('');
  readonly submitted = signal(false);
  readonly active = signal<SectionId>('identite');
  /** Nombre d'erreurs visibles par section, recalculé à chaque saisie. */
  readonly sectionErrors = signal<Record<SectionId, number>>({ identite: 0, physique: 0, talents: 0, parcours: 0, dispos: 0 });

  readonly R = RULES;
  readonly today = todayIso();
  readonly maxYear = new Date().getFullYear() + 2;
  readonly frDate = frDate;
  readonly sections: { id: SectionId; label: string }[] = [
    { id: 'identite', label: 'Identité' },
    { id: 'physique', label: 'Physique' },
    { id: 'talents', label: 'Langues et talents' },
    { id: 'parcours', label: 'Parcours' },
    { id: 'dispos', label: 'Disponibilités' }
  ];
  readonly genders = ['Femme', 'Homme', 'Non-binaire'];
  readonly languageSuggestions = ['Français', 'Anglais', 'Espagnol', 'Arabe', 'Italien', 'Allemand', 'Portugais'];
  readonly skillSuggestions = ['Danse', 'Chant', 'Comédie', 'Sport', 'Équitation', 'Escrime', 'Natation', 'Acrobatie'];
  readonly eyeColors = ['Marron', 'Noisette', 'Vert', 'Bleu', 'Gris', 'Noir'];
  readonly hairColors = ['Noir', 'Brun', 'Châtain', 'Roux', 'Blond', 'Gris', 'Blanc', 'Chauve'];
  readonly skillLevels = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'];
  readonly languageLevels = ['Notions', 'Intermédiaire', 'Courant', 'Natif'];

  constructor() {
    // L'indicateur du sommaire suit l'onglet actif, quelle que soit sa taille (vertical sur bureau, horizontal sur tablette/mobile).
    afterRenderEffect(() => { this.active(); this.loaded(); this.placeIndicator(); });
  }

  /** PC : trait vertical sous la rubrique active. Tablette/mobile : pastille centrée exactement dans le carrousel. */
  private placeIndicator(): void {
    const nav = this.host.nativeElement.querySelector('.toc') as HTMLElement | null;
    const btns = nav ? Array.from(nav.querySelectorAll('button')) as HTMLElement[] : [];
    const btn = nav?.querySelector('button.on') as HTMLElement | null;
    if (!nav || !btn || !btns.length) return;
    const carousel = window.matchMedia('(max-width: 1000px)').matches;
    if (carousel) {
      // Marges intérieures : la première et la dernière rubrique peuvent, elles aussi, venir au centre.
      nav.style.setProperty('--pl', Math.max(0, (nav.clientWidth - btns[0].offsetWidth) / 2) + 'px');
      nav.style.setProperty('--pr', Math.max(0, (nav.clientWidth - btns[btns.length - 1].offsetWidth) / 2) + 'px');
    }
    nav.style.setProperty('--x', btn.offsetLeft + 'px');
    nav.style.setProperty('--y', btn.offsetTop + 'px');
    nav.style.setProperty('--w', btn.offsetWidth + 'px');
    nav.style.setProperty('--h', btn.offsetHeight + 'px');
    const first = !nav.classList.contains('ready');
    nav.classList.add('ready');
    if (carousel) nav.scrollTo({ left: btn.offsetLeft + btn.offsetWidth / 2 - nav.clientWidth / 2, behavior: first ? 'auto' : 'smooth' });
  }

  /** Couleurs proposées ; une ancienne valeur hors liste reste affichée telle quelle. */
  colorOptions(list: string[], current: string): SelectOption[] {
    const base: SelectOption[] = [{ value: '', label: 'Non précisé' }, ...list];
    return current && !list.includes(current) ? [...base, current] : base;
  }

  ngOnInit(): void {
    this.buildForm();
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isEdit.set(true);
      this.actorId.set(id);
      this.loadActor(id);
    }
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.refreshCounts());
    this.form.statusChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.refreshCounts());
    // Le défilement se fait dans le conteneur de la mise en page : écoute en phase de capture.
    const onScroll = () => this.onScroll();
    document.addEventListener('scroll', onScroll, true);
    // Défilement manuel (molette, toucher, clavier) : le suivi reprend.
    const resume = (e: Event) => {
      if (e instanceof KeyboardEvent && !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key)) return;
      this.follow = true;
    };
    for (const t of ['wheel', 'touchstart', 'keydown']) document.addEventListener(t, resume, { passive: true });
    this.destroyRef.onDestroy(() => { for (const t of ['wheel', 'touchstart', 'keydown']) document.removeEventListener(t, resume); });
    const onResize = () => this.placeIndicator();
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => { document.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onResize); });
  }

  private buildForm(): void {
    const n = RULES.nameMax;
    this.form = this.fb.group({
      firstName: ['', [Validators.required, notBlank, personName, Validators.maxLength(n)]],
      lastName: ['', [Validators.required, notBlank, personName, Validators.maxLength(n)]],
      birthDate: [''],
      gender: [''],
      city: ['', Validators.maxLength(n)],
      country: ['', Validators.maxLength(n)],
      phone: ['', phone],
      email: ['', [email, Validators.maxLength(160)]],
      bio: ['', Validators.maxLength(RULES.bioMax)],
      height: [null as number | null, intBetween(RULES.height.min, RULES.height.max)],
      weight: [null as number | null, intBetween(RULES.weight.min, RULES.weight.max)],
      eyeColor: ['', Validators.maxLength(40)],
      hairColor: ['', Validators.maxLength(40)],
      skills: this.fb.array([], uniqueNames),
      languages: this.fb.array([], uniqueNames),
      experiences: this.fb.array([]),
      availabilities: this.fb.array([], noOverlap)
    }, { validators: this.yearsAfterBirth });
  }

  /** Une expérience ne peut pas précéder l'année de naissance. */
  private readonly yearsAfterBirth: ValidatorFn = (g: AbstractControl) => {
    const birth = g.get('birthDate')?.value as string;
    if (!birth) return null;
    const by = +birth.slice(0, 4);
    const bad = (g.get('experiences') as FormArray).controls
      .map((c, i) => ({ i, y: c.get('year')?.value }))
      .filter(x => x.y !== null && x.y !== '' && +x.y < by)
      .map(x => x.i);
    return bad.length ? { yearBeforeBirth: bad } : null;
  };

  get skills(): FormArray { return this.form.get('skills') as FormArray; }
  get languages(): FormArray { return this.form.get('languages') as FormArray; }
  get experiences(): FormArray { return this.form.get('experiences') as FormArray; }
  get availabilities(): FormArray { return this.form.get('availabilities') as FormArray; }

  private nameRow(v?: { name?: string; level?: string }): FormGroup {
    return this.fb.group({ name: [v?.name ?? '', [Validators.required, notBlank, Validators.maxLength(60)]], level: [v?.level ?? ''] });
  }
  private expRow(v?: any): FormGroup {
    return this.fb.group({
      title: [v?.title ?? '', [Validators.required, notBlank, Validators.maxLength(120)]],
      production: [v?.production ?? '', Validators.maxLength(160)],
      role: [v?.role ?? '', Validators.maxLength(120)],
      year: [v?.year ?? null, intBetween(RULES.yearMin, this.maxYear)],
      description: [v?.description ?? '', Validators.maxLength(1000)]
    });
  }
  private periodRow(v?: any): FormGroup {
    return this.fb.group({
      fromDate: [v?.fromDate ?? '', Validators.required],
      toDate: [v?.toDate ?? '', Validators.required],
      note: [v?.note ?? '', Validators.maxLength(160)]
    }, { validators: periodOrder() });
  }

  addSkill(): void { this.skills.push(this.nameRow()); this.focusLast('.skills'); }
  addLanguage(): void { this.languages.push(this.nameRow()); this.focusLast('.langs'); }
  addExperience(): void { this.experiences.push(this.expRow()); this.focusLast('#parcours'); }
  addAvailability(): void { this.availabilities.push(this.periodRow()); this.focusLast('#dispos'); }
  remove(arr: FormArray, i: number): void { arr.removeAt(i); arr.markAsDirty(); }

  /** La fin d'une période ne peut pas précéder son début. */
  periodMin(i: number): string | null { return this.availabilities.at(i).get('fromDate')?.value || null; }

  private focusLast(scope: string): void {
    setTimeout(() => {
      const rows = this.host.nativeElement.querySelectorAll(`${scope} .row-card, ${scope} .pair`);
      (rows[rows.length - 1] as HTMLElement | undefined)?.querySelector<HTMLElement>('input')?.focus();
    });
  }

  private loadActor(id: string): void {
    this.loaded.set(false);
    this.actorService.findById(id).subscribe({
      next: actor => {
        const { skills, languages, experiences, availabilities, ...rest } = actor as any;
        this.form.patchValue({ ...rest, birthDate: rest.birthDate ?? '' });
        (skills ?? []).forEach((s: any) => this.skills.push(this.nameRow(s)));
        (languages ?? []).forEach((l: any) => this.languages.push(this.nameRow(l)));
        (experiences ?? []).forEach((e: any) => this.experiences.push(this.expRow(e)));
        (availabilities ?? []).forEach((a: any) => this.availabilities.push(this.periodRow(a)));
        this.form.markAsPristine();
        this.loaded.set(true);
        this.refreshCounts();
      },
      error: () => { this.loaded.set(true); this.error.set('Dossier introuvable ou serveur indisponible.'); }
    });
  }

  // --- Affichage des erreurs ---
  show(c: AbstractControl | null): boolean {
    return !!c && c.invalid && (c.touched || c.dirty || this.submitted());
  }
  msg(path: string | AbstractControl, label?: string): string {
    const c = typeof path === 'string' ? this.form.get(path) : path;
    return this.show(c) ? errorMessage(c!.errors, label) : '';
  }
  ctl(arr: FormArray, i: number, key: string): AbstractControl { return arr.at(i).get(key)!; }

  isDuplicate(arr: FormArray, i: number): boolean {
    return (arr.errors?.['duplicate'] as number[] | undefined)?.includes(i) ?? false;
  }
  periodError(i: number): string {
    const g = this.availabilities.at(i);
    if (g.errors?.['periodOrder']) return 'La fin ne peut pas précéder le début.';
    const o = this.availabilities.errors?.['overlap'];
    if (o && (o.a === i || o.b === i)) return `Chevauche la période ${(o.a === i ? o.b : o.a) + 1}.`;
    if (this.show(g.get('fromDate')) || this.show(g.get('toDate'))) {
      if (!g.get('fromDate')?.value || !g.get('toDate')?.value) return 'Indiquez le début et la fin.';
    }
    return '';
  }
  yearError(i: number): string {
    const c = this.ctl(this.experiences, i, 'year');
    if (this.show(c)) return errorMessage(c.errors);
    const bad = this.form.errors?.['yearBeforeBirth'] as number[] | undefined;
    return bad?.includes(i) ? `Antérieure à la naissance (${this.form.get('birthDate')?.value.slice(0, 4)}).` : '';
  }

  age(): number | null {
    const b = this.form.get('birthDate')?.value;
    return b && !this.form.get('birthDate')?.invalid ? ageAt(b) : null;
  }
  periodDays(i: number): number | null {
    const g = this.availabilities.at(i).value;
    if (!g.fromDate || !g.toDate || g.toDate < g.fromDate) return null;
    return Math.round((Date.parse(g.toDate) - Date.parse(g.fromDate)) / 86400000) + 1;
  }

  private refreshCounts(): void {
    const count = (ctrls: (AbstractControl | null)[]) => ctrls.filter(c => this.show(c)).length;
    const f = this.form;
    const rowsInvalid = (arr: FormArray, extra = 0) =>
      arr.controls.reduce((n, g) => n + count(Object.values((g as FormGroup).controls)) + (g.errors && (g.touched || this.submitted()) ? 1 : 0), 0) + extra;
    const dupes = (arr: FormArray) => (arr.errors?.['duplicate']?.length ?? 0);
    this.sectionErrors.set({
      identite: count(['firstName', 'lastName', 'birthDate', 'gender', 'city', 'country', 'phone', 'email'].map(k => f.get(k))),
      physique: count(['height', 'weight', 'eyeColor', 'hairColor', 'bio'].map(k => f.get(k))),
      talents: rowsInvalid(this.languages, dupes(this.languages)) + rowsInvalid(this.skills, dupes(this.skills)),
      parcours: rowsInvalid(this.experiences, (f.errors?.['yearBeforeBirth']?.length ?? 0)),
      dispos: rowsInvalid(this.availabilities, this.availabilities.errors?.['overlap'] ? 1 : 0)
    });
  }

  totalErrors(): number { return Object.values(this.sectionErrors()).reduce((a, b) => a + b, 0); }

  /** Après un clic dans le sommaire, la rubrique choisie reste active jusqu'à ce que l'utilisateur fasse défiler lui-même. */
  private follow = true;
  private frame = 0;

  scrollTo(id: SectionId): void {
    this.active.set(id);
    this.follow = false;
    this.host.nativeElement.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onScroll(): void {
    if (!this.follow || this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; if (this.follow) this.spy(); });
  }

  private spy(): void {
    // Section active = la dernière dont le haut est passé sous l'en-tête.
    let current: SectionId = 'identite';
    for (const s of this.sections) {
      const el = this.host.nativeElement.querySelector(`#${s.id}`) as HTMLElement | null;
      if (el && el.getBoundingClientRect().top < 180) current = s.id;
    }
    // En bas de page, la dernière section courte ne passe jamais sous l'en-tête : on la désigne.
    const last = this.host.nativeElement.querySelector('#dispos') as HTMLElement | null;
    if (last && last.getBoundingClientRect().bottom < window.innerHeight - 60) current = 'dispos';
    if (current !== this.active()) this.active.set(current);
  }

  onSubmit(): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    this.refreshCounts();
    if (this.form.invalid) {
      this.error.set('');
      setTimeout(() => {
        const first = this.host.nativeElement.querySelector('.invalid, [aria-invalid="true"], .field-msg') as HTMLElement | null;
        first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (first?.querySelector('input') ?? (first?.tagName === 'INPUT' ? first : null))?.focus?.({ preventScroll: true });
      });
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const v = this.form.getRawValue();
    const trim = (s: string) => (typeof s === 'string' ? s.trim() : s);
    const body = {
      ...v,
      firstName: trim(v.firstName), lastName: trim(v.lastName), email: trim(v.email) || null, phone: trim(v.phone) || null,
      city: trim(v.city) || null, country: trim(v.country) || null, bio: trim(v.bio) || null,
      birthDate: v.birthDate || null, gender: v.gender || null,
      height: v.height === '' ? null : v.height, weight: v.weight === '' ? null : v.weight,
      skills: v.skills.map((s: any) => ({ ...s, name: trim(s.name) })),
      languages: v.languages.map((s: any) => ({ ...s, name: trim(s.name) })),
      experiences: v.experiences.map((e: any) => ({ ...e, title: trim(e.title), year: e.year === '' ? null : e.year })),
      availabilities: v.availabilities.map((a: any) => ({ ...a, note: trim(a.note) || null }))
    };
    const req$ = this.isEdit() ? this.actorService.update(this.actorId()!, body) : this.actorService.create(body);
    req$.subscribe({
      next: (a: any) => this.router.navigate(['/actors', a?.id ?? this.actorId()]),
      error: (e: HttpErrorResponse) => {
        this.loading.set(false);
        const errs = e.error?.errors as Record<string, string> | undefined;
        this.error.set(e.error?.message ?? (errs ? Object.values(errs).join(' ') : "L'enregistrement a échoué. Réessayez."));
      }
    });
  }

  cancel(): void {
    this.router.navigate(this.isEdit() ? ['/actors', this.actorId()] : ['/dashboard']);
  }
}
