import { Component, ElementRef, NgZone, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthResponse, AuthService } from '../../../core/services/auth.service';
import { EMAIL_RE, notBlank, personName } from '../../../shared/forms/rules';

declare global {
  interface Window { google?: any; FB?: any; fbAsyncInit?: () => void; }
}

/** Charge un script tiers une seule fois. */
function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      // Déjà ajouté : attendre la fin du chargement s'il n'est pas encore terminé.
      if (existing.dataset['loaded'] === '1') { resolve(); return; }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = src; s.id = id; s.async = true; s.defer = true;
    s.onload = () => { s.dataset['loaded'] = '1'; resolve(); };
    s.onerror = () => reject();
    document.head.appendChild(s);
  });
}

const emailFormat = (c: AbstractControl): ValidationErrors | null =>
  c.value && !EMAIL_RE.test(String(c.value).trim()) ? { email: true } : null;

/** Connexion (agence et acteurs) et inscription des acteurs freelance, avec Google ou Facebook si configurés. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly zone = inject(NgZone);

  /** « login » ou « inscription » (acteur freelance). */
  readonly mode: 'login' | 'inscription' = this.route.snapshot.data['mode'] === 'inscription' ? 'inscription' : 'login';

  form: FormGroup;
  loading = false;
  error = '';
  showPassword = false;
  emailFocused = false;
  pwFocused = false;

  readonly google = signal<string | null>(null);
  readonly facebook = signal<string | null>(null);
  readonly socialBusy = signal<'' | 'google' | 'facebook'>('');
  /** Zone du bouton Google : elle n'existe qu'après l'affichage du bloc @if. */
  private googleEl?: HTMLElement;
  private gsiReady = false;
  @ViewChild('googleBtn') set googleBtn(ref: ElementRef<HTMLElement> | undefined) {
    this.googleEl = ref?.nativeElement;
    this.renderGoogle();
  }

  /** Planche contact décorative : un profil retenu, un écarté. */
  readonly frames = [
    { n: 1, tone: '#4A4C55', mark: '' }, { n: 2, tone: '#5A5650', mark: 'ok' }, { n: 3, tone: '#43474F', mark: '' },
    { n: 4, tone: '#504C47', mark: 'ko' }, { n: 5, tone: '#474B53', mark: '' }, { n: 6, tone: '#55524C', mark: '' },
  ];

  constructor() {
    this.form = this.mode === 'inscription'
      ? this.fb.group({
          firstName: ['', [Validators.required, notBlank, personName, Validators.maxLength(80)]],
          lastName: ['', [Validators.required, notBlank, personName, Validators.maxLength(80)]],
          email: ['', [Validators.required, emailFormat]],
          password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(100)]],
          age: ['', [Validators.required]],
          guardianName: ['', [Validators.maxLength(120)]],
          acceptTerms: [false, [Validators.requiredTrue]]
        })
      : this.fb.group({
          email: ['', [Validators.required, emailFormat]],
          password: ['', [Validators.required]]
        });
  }

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) { this.router.navigateByUrl(this.authService.homeFor()); return; }
    this.authService.providers().subscribe({
      next: p => {
        this.google.set(p.google);
        this.facebook.set(p.facebook);
        if (p.google) this.setupGoogle(p.google);
        if (p.facebook) this.setupFacebook(p.facebook);
      },
      error: () => {}
    });
  }

  fieldError(name: string): string {
    const c = this.form.get(name);
    if (!c || !c.invalid || !c.touched) return '';
    const e = c.errors!;
    if (name === 'acceptTerms') return 'Cochez la case pour créer votre compte.';
    if (name === 'age') return 'Indiquez votre âge.';
    if (e['required'] || e['blank']) return 'Champ obligatoire.';
    if (e['email']) return 'Adresse e-mail incomplète (ex. nom@domaine.fr).';
    if (e['minlength']) return '8 caractères au moins.';
    if (e['personName']) return 'Pas de chiffres ni de symboles.';
    if (e['maxlength']) return 'Trop long.';
    return 'Valeur invalide.';
  }

  /** Indication de solidité du mot de passe (inscription). */
  strength(): { level: 0 | 1 | 2 | 3; label: string } {
    const p: string = this.form.get('password')?.value ?? '';
    if (!p) return { level: 0, label: '' };
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    if (p.length < 8) return { level: 1, label: 'Trop court' };
    return score >= 4 ? { level: 3, label: 'Solide' } : score >= 2 ? { level: 2, label: 'Correct' } : { level: 1, label: 'Faible' };
  }

  /** T-101 · un mineur s'inscrit avec l'accord de son représentant légal. */
  setAge(a: 'MAJEUR' | 'MINEUR'): void {
    this.form.get('age')!.setValue(a);
    const g = this.form.get('guardianName')!;
    g.setValidators(a === 'MINEUR' ? [Validators.required, notBlank, personName, Validators.maxLength(120)] : [Validators.maxLength(120)]);
    if (a === 'MAJEUR') g.setValue('');
    g.updateValueAndValidity();
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.loading) return;
    this.loading = true;
    this.error = '';
    const v = this.form.value;
    const call = this.mode === 'inscription'
      ? this.authService.register({ email: v.email.trim(), password: v.password, firstName: v.firstName.trim(), lastName: v.lastName.trim(),
          acceptTerms: v.acceptTerms === true, age: v.age, guardianName: v.age === 'MINEUR' ? v.guardianName.trim() : undefined })
      : this.authService.login({ email: v.email.trim(), password: v.password });
    call.subscribe({
      next: r => this.done(r),
      error: (e: HttpErrorResponse) => {
        this.loading = false;
        this.error = e.status === 0 ? 'Serveur injoignable. Réessayez dans un instant.'
          : e.error?.message ?? (this.mode === 'inscription' ? 'Inscription impossible. Réessayez.' : 'E-mail ou mot de passe incorrect');
      }
    });
  }

  private done(r: AuthResponse): void {
    this.router.navigateByUrl(this.authService.homeFor(r.role));
  }

  private social(provider: 'google' | 'facebook', token: string): void {
    this.zone.run(() => {
      this.socialBusy.set(provider);
      this.error = '';
      this.authService.loginWith(provider, token).subscribe({
        next: r => this.done(r),
        error: (e: HttpErrorResponse) => {
          this.socialBusy.set('');
          this.error = e.error?.message ?? 'Connexion refusée par le fournisseur. Réessayez.';
        }
      });
    });
  }

  // ── Google : bouton officiel (Google Identity Services) ──
  private setupGoogle(clientId: string): void {
    loadScript('https://accounts.google.com/gsi/client?hl=fr', 'gsi-client').then(() => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp: { credential: string }) => this.social('google', resp.credential),
        ux_mode: 'popup'
      });
      this.gsiReady = true;
      this.renderGoogle();
    }).catch(() => this.google.set(null));
  }

  /** Dessine le bouton dès que le script ET la zone sont prêts, quel que soit l'ordre d'arrivée. */
  private renderGoogle(): void {
    const el = this.googleEl;
    if (!this.gsiReady || !el || !window.google?.accounts?.id || el.childElementCount > 0) return;
    // Laisser la mise en page se faire pour connaître la largeur réelle de la zone.
    setTimeout(() => {
      if (el.childElementCount > 0) return;
      window.google.accounts.id.renderButton(el, {
        theme: document.documentElement.classList.contains('light') ? 'outline' : 'filled_black',
        size: 'large', shape: 'pill', logo_alignment: 'left', locale: 'fr',
        text: this.mode === 'inscription' ? 'signup_with' : 'continue_with',
        width: Math.min(400, el.clientWidth || 320)
      });
    });
  }

  // ── Facebook : SDK JavaScript, autorisations e-mail et profil public uniquement ──
  private setupFacebook(appId: string): void {
    window.fbAsyncInit = () => window.FB.init({ appId, cookie: false, xfbml: false, version: 'v21.0' });
    loadScript('https://connect.facebook.net/fr_FR/sdk.js', 'fb-sdk').catch(() => this.facebook.set(null));
  }

  loginFacebook(): void {
    if (!window.FB) { this.error = 'Facebook est encore en chargement, réessayez dans un instant.'; return; }
    window.FB.login((resp: any) => {
      if (resp?.authResponse?.accessToken) this.social('facebook', resp.authResponse.accessToken);
    }, { scope: 'public_profile,email' });
  }
}
