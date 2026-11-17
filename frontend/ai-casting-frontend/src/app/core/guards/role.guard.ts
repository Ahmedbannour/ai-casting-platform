import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Réserve une route à certains rôles ; sinon renvoie vers l'accueil du rôle (sans message d'erreur). */
export function roleGuard(...roles: string[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const role = auth.role();
    if (!role || roles.includes(role)) return true;      // rôle inconnu : le serveur tranchera
    return router.parseUrl(auth.homeFor(role));
  };
}

/** Accueil de l'application : la page qui correspond au rôle. */
export const homeRedirect: CanActivateFn = () => {
  const auth = inject(AuthService);
  return inject(Router).parseUrl(auth.homeFor());
};
