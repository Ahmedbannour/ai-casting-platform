import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ActorService } from '../../../core/services/actor.service';

@Component({
  selector: 'app-actor-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './actor-form.html',
  styleUrl: './actor-form.scss'
})
export class ActorFormComponent implements OnInit {

  form!: FormGroup;
  isEdit = signal(false);
  actorId = signal<string | null>(null);
  loading = signal(false);
  error = signal('');

  constructor(
    private fb: FormBuilder,
    private actorService: ActorService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.buildForm();
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isEdit.set(true);
      this.actorId.set(id);
      this.loadActor(id);
    }
  }

  buildForm(): void {
    this.form = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      birthDate: [''],
      gender: [''],
      city: [''],
      country: [''],
      phone: [''],
      email: [''],
      bio: [''],
      height: [''],
      weight: [''],
      eyeColor: [''],
      hairColor: [''],
      skills: this.fb.array([]),
      languages: this.fb.array([]),
      experiences: this.fb.array([])
    });
  }

  get skills(): FormArray { return this.form.get('skills') as FormArray; }
  get languages(): FormArray { return this.form.get('languages') as FormArray; }
  get experiences(): FormArray { return this.form.get('experiences') as FormArray; }

  addSkill(): void {
    this.skills.push(this.fb.group({ name: ['', Validators.required], level: [''] }));
  }

  removeSkill(i: number): void { this.skills.removeAt(i); }

  addLanguage(): void {
    this.languages.push(this.fb.group({ name: ['', Validators.required], level: [''] }));
  }

  scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  removeLanguage(i: number): void { this.languages.removeAt(i); }

  addExperience(): void {
    this.experiences.push(this.fb.group({
      title: ['', Validators.required],
      production: [''], role: [''],
      year: [''], description: ['']
    }));
  }

  removeExperience(i: number): void { this.experiences.removeAt(i); }

  loadActor(id: string): void {
    this.actorService.findById(id).subscribe(actor => {
      this.form.patchValue(actor);
      actor.skills?.forEach(s => this.skills.push(this.fb.group(s)));
      actor.languages?.forEach(l => this.languages.push(this.fb.group(l)));
      actor.experiences?.forEach(e => this.experiences.push(this.fb.group(e)));
    });
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');

    const request$ = this.isEdit()
      ? this.actorService.update(this.actorId()!, this.form.value)
      : this.actorService.create(this.form.value);

    request$.subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: () => {
        this.error.set('Une erreur est survenue');
        this.loading.set(false);
      }
    });
  }

  cancel(): void {
    this.router.navigate(['/dashboard']);
  }
}
