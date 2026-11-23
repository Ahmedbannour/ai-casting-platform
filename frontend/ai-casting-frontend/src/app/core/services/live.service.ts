import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

interface Pulse { seq: number; others: boolean; }

/**
 * Mises à jour en direct : interroge le pouls du serveur toutes les quelques secondes
 * (onglet visible seulement) et prévient les pages quand quelqu'un d'autre a agi.
 * Chaque page choisit quoi recharger ; rien ne bouge pendant qu'on écrit.
 */
@Injectable({ providedIn: 'root' })
export class LiveService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = `${environment.apiUrl}/me/pulse`;
  private static readonly EVERY_MS = 8000;

  /** Émis quand un autre utilisateur a modifié quelque chose. */
  readonly changed = new Subject<void>();
  /** Heure de la dernière mise à jour reçue (pour « mis à jour à l'instant »). */
  readonly lastUpdate = signal<number | null>(null);

  private seq = -1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor() {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.poll(); });
  }

  start(): void {
    if (this.timer) return;
    this.poll();
    this.timer = setInterval(() => { if (!document.hidden) this.poll(); }, LiveService.EVERY_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.seq = -1;
  }

  /**
   * Abonne une page : {@code reload} est appelé à chaque activité d'un autre utilisateur,
   * sauf si {@code paused()} répond vrai (saisie en cours, glissement de carte…).
   */
  watch(destroyRef: DestroyRef, reload: () => void, paused: () => boolean = () => false): void {
    this.start();
    const sub = this.changed.subscribe(() => { if (!paused() && !LiveService.typing()) reload(); });
    destroyRef.onDestroy(() => sub.unsubscribe());
  }

  /** Vrai si le focus est dans un champ de saisie : on ne recharge pas sous les doigts. */
  static typing(): boolean {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  }

  private poll(): void {
    if (this.busy || !this.auth.isAuthenticated()) return;
    this.busy = true;
    this.http.get<Pulse>(this.url, { params: { since: this.seq }, context: new HttpContext() }).subscribe({
      next: p => {
        const first = this.seq < 0;
        this.seq = p.seq;
        this.busy = false;
        if (!first && p.others) { this.lastUpdate.set(Date.now()); this.changed.next(); }
      },
      error: () => { this.busy = false; }
    });
  }
}
