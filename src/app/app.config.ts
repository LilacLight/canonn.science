import { ApplicationConfig } from '@angular/core';
import { UrlSerializer, provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { EditModeUrlSerializer } from './services/edit-mode';

export const appConfig: ApplicationConfig = {
  providers: [
    // New pages open at the top; Back/Forward restore the previous scroll position.
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    provideHttpClient(),
    // Keeps ?edit=1 on every link while the hidden article editor is switched on.
    { provide: UrlSerializer, useClass: EditModeUrlSerializer },
  ],
};
