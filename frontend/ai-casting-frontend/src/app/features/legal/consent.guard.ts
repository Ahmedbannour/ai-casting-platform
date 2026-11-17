import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { ConsentService } from './consent.service';

/** T-101 · Sans accord à la version en vigueur des conditions, on passe d'abord par la page d'accord. */
export const consentGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(ConsentService).required().pipe(
    map(req => req ? router.createUrlTree(['/consentement'], { queryParams: { suite: state.url } }) : true));
};
