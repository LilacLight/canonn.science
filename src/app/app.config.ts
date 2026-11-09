import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [// New pages open at the top; Back/Forward restore the previous scroll position.
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })), provideHttpClient()],
};
