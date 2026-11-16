import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {

  form: FormGroup;
  loading = false;
  error = '';
  showPassword = false;

  /** Planche contact décorative : un profil retenu, un écarté. */
  readonly frames = [
    { n: 1, tone: '#4A4C55', mark: '' }, { n: 2, tone: '#5A5650', mark: 'ok' }, { n: 3, tone: '#43474F', mark: '' },
    { n: 4, tone: '#504C47', mark: 'ko' }, { n: 5, tone: '#474B53', mark: '' }, { n: 6, tone: '#55524C', mark: '' },
  ];
  emailFocused = false;
  pwFocused = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]]
    });
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.error = '';

    this.authService.login(this.form.value).subscribe({
      next: () => this.router.navigate(['/chat']),
      error: () => {
        this.error = 'Email ou mot de passe incorrect';
        this.loading = false;
      }
    });
  }
}
