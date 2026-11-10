import { Component, inject } from '@angular/core';
import { AsyncPipe, DatePipe, NgForOf, NgIf } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ShareBlueskyComponent } from '../../components/share-bluesky.component';
import { ArticleSummary, Category, ContentService, articleLink } from '../../services/content.service';

const isPinned = (a: ArticleSummary, slug: string) => a.categories.some((c) => c.slug === slug && c.pinned);

@Component({
  selector: 'app-article-list',
  standalone: true,
  imports: [AsyncPipe, DatePipe, NgForOf, NgIf, RouterLink, ShareBlueskyComponent],
  template: `
    <section class="container list-page" *ngIf="categoryName$ | async as name">
      <nav class="breadcrumb"><a routerLink="/">Home</a> / {{ name }}</nav>
      <h1>{{ name }}</h1>
      <p class="share"><app-share-bluesky [text]="name"></app-share-bluesky></p>

      <div class="article-grid" *ngIf="articles$ | async as articles">
        <a class="card" *ngFor="let article of articles" [routerLink]="articleLink(article)">
          <div class="card-media" *ngIf="article.banner_image">
            <img [src]="article.banner_image" alt="" loading="lazy" />
          </div>
          <div class="card-body">
            <h3>{{ article.title }}</h3>
            <p class="card-date" *ngIf="article.date">{{ article.date | date: 'longDate' }}</p>
            <div class="card-excerpt">{{ article.excerpt }}</div>
          </div>
        </a>
        <p class="empty" *ngIf="articles.length === 0">No articles in this topic yet.</p>
      </div>
    </section>
  `,
  styles: [`
    .list-page {
      padding: 2.5rem 1.5rem 4rem;
    }

    .share { margin: 0 0 1rem; }

    .breadcrumb {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-bottom: 0.6rem;
    }

    .article-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1.25rem;
      margin-top: 2rem;
    }

    .card {
      display: flex;
      flex-direction: column;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
      color: var(--text);
      transition: border-color 0.15s, transform 0.15s;
    }

    .card:hover {
      text-decoration: none;
      border-color: var(--accent);
      transform: translateY(-2px);
    }

    .card-media {
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: var(--surface-raised);
    }

    .card-media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .card-body {
      padding: 1.1rem 1.25rem 1.3rem;
    }

    .card-body h3 {
      font-size: 1.02rem;
      margin-bottom: 0.3rem;
    }

    .card-date {
      color: var(--text-muted);
      font-size: 0.78rem;
      margin: 0 0 0.5rem;
    }

    .card-excerpt {
      color: var(--text-muted);
      font-size: 0.88rem;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .empty {
      color: var(--text-muted);
    }
  `],
})
export class ArticleListComponent {
  articleLink = articleLink;

  private route = inject(ActivatedRoute);
  private content = inject(ContentService);

  private slug$ = this.route.paramMap.pipe(map((params) => params.get('slug')!));

  categoryName$: Observable<string> = this.slug$.pipe(
    switchMap((slug) =>
      this.content.getCategories().pipe(
        map((cats: Category[]) => cats.find((c) => c.slug === slug)?.name ?? slug),
      ),
    ),
  );

  articles$: Observable<ArticleSummary[]> = this.slug$.pipe(
    switchMap((slug) =>
      this.content.getManifest().pipe(
        map((articles) =>
          articles
            .filter((a) => a.categories.some((c) => c.slug === slug))
            // Pinned first, then most recent first; undated articles go last.
            .sort((a, b) => Number(isPinned(b, slug)) - Number(isPinned(a, slug)) || (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0)),
        ),
      ),
    ),
  );
}
