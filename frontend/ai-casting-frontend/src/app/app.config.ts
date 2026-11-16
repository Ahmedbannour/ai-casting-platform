import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';
import { TokenService } from './core/services/token.service';

/**
 * Avant d'afficher l'application, renouvelle le jeton d'accès à partir du
 * refresh token : ainsi aucune requête ne part sans jeton après un rechargement.
 */
function restoreSession() {
  const tokens = inject(TokenService);
  const auth = inject(AuthService);
  if (!tokens.getRefreshToken() || tokens.getAccessToken()) {
    return of(null);
  }
  return auth.refresh().pipe(
    catchError(() => {
      tokens.clearTokens();
      return of(null);
    })
  );
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAppInitializer(restoreSession)
  ]
};
