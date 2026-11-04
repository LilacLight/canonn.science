import { Component, inject } from '@angular/core';
import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { SearchResult, SearchService } from '../../services/search.service';
import { articleLink } from '../../services/content.service';

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [AsyncPipe, NgFor, NgIf, RouterLink],
  template: `
    <section class="container search-page">
      <nav class="breadcrumb"><a routerLink="/">Home</a> / Search</nav>
      <h1>Search results <span *ngIf="query$ | async as q">for "{{ q }}"</span></h1>

      <ng-container *ngIf="results$ | async as results">
        <p class="count">{{ results.length }} match{{ results.length === 1 ? '' : 'es' }}</p>
        <ul class="result-list">
          <li *ngFor="let result of results">
            <a [routerLink]="articleLink(result)">{{ result.title }}</a>
            <p class="snippet">{{ result.snippet }}</p>
          </li>
        </ul>
        <p class="empty" *ngIf="results.length === 0">No articles matched your search.</p>
      </ng-container>
    </section>
  `,
  styles: [`
    .search-page {
      padding: 2.5rem 1.5rem 4rem;
      max-width: 760px;
    }

    .breadcrumb {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-bottom: 0.75rem;
    }

    .count {
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    .result-list {
      list-style: none;
      padding: 0;
      margin: 1.5rem 0 0;
    }

    .result-list li {
      border-bottom: 1px solid var(--border);
      padding: 1.1rem 0;
    }

    .result-list a {
      font-family: var(--font-display);
      font-weight: 600;
      font-size: 1.05rem;
    }

    .snippet {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin: 0.4rem 0 0;
    }

    .empty {
      color: var(--text-muted);
    }
  `],
})
export class SearchComponent {
  articleLink = articleLink;

  private route = inject(ActivatedRoute);
  private search = inject(SearchService);

  query$: Observable<string> = this.route.queryParamMap.pipe(
    map((params) => params.get('q') ?? ''),
  );

  results$: Observable<SearchResult[]> = this.query$.pipe(
    switchMap((q) => this.search.search(q)),
  );
}
