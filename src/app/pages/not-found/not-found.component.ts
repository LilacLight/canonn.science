import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="container not-found">
      <h1>Page not found</h1>
      <p><a routerLink="/">Back to the archive</a></p>
    </div>
  `,
  styles: [`
    .not-found {
      padding: 4rem 1.5rem;
      text-align: center;
    }
  `],
})
export class NotFoundComponent {}
