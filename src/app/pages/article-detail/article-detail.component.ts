import { Component, inject } from '@angular/core';
import { AsyncPipe, DatePipe, NgFor, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, combineLatest, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { Article, ContentService, articleLink } from '../../services/content.service';
import { ArticleHtmlPipe, ArticleSegment, ScriptedHtmlDirective } from '../../services/article-html';
import { XyzConverterComponent } from '../../widgets/xyz-converter.component';
import { GnosisItineraryComponent } from '../../widgets/gnosis-itinerary.component';
import { NotFoundComponent } from '../not-found/not-found.component';

interface Placement {
  catName: string;
  catLink: string[];
  subName: string | null;
  subLink: string[] | null;
}

@Component({
  selector: 'app-article-detail',
  standalone: true,
  imports: [AsyncPipe, DatePipe, NgIf, NgFor, RouterLink, NotFoundComponent, ArticleHtmlPipe, ScriptedHtmlDirective, XyzConverterComponent, GnosisItineraryComponent, NgSwitch, NgSwitchCase, NgSwitchDefault],
  template: `
    <app-not-found *ngIf="notFound"></app-not-found>
    <ng-container *ngIf="article$ | async as article">
      <div class="hero" *ngIf="article.banner_image">
        <img [src]="article.banner_image" alt="" />
        <div class="hero-shade"></div>
      </div>

      <article class="container article-page">
        <ng-container *ngIf="placement$ | async as places">
          <nav class="breadcrumb">
            <a routerLink="/">Home</a>
            <ng-container *ngIf="places[0] as first">
              / <a [routerLink]="first.catLink">{{ first.catName }}</a>
              <ng-container *ngIf="first.subName">
                / <a *ngIf="first.subLink; else plainSub" [routerLink]="first.subLink">{{ first.subName }}</a>
                <ng-template #plainSub>{{ first.subName }}</ng-template>
              </ng-container>
            </ng-container>
          </nav>
        </ng-container>

        <h1>{{ article.title }}</h1>
        <p class="author" *ngIf="article.author">By {{ article.author }}</p>
        <p class="meta" *ngIf="article.date">{{ article.date | date: 'longDate' }}</p>

        <div class="tags" *ngIf="placement$ | async as places">
          <ng-container *ngIf="places.length; else oldTags">
            <ng-container *ngFor="let p of places">
              <a class="tag" [routerLink]="p.catLink">{{ p.catName }}</a>
              <a class="tag" *ngIf="p.subName && p.subLink" [routerLink]="p.subLink">{{ p.subName }}</a>
            </ng-container>
          </ng-container>
          <ng-template #oldTags>
            <a class="tag" *ngFor="let cat of article.categories" [routerLink]="['/category', cat.slug]">{{ cat.name }}</a>
          </ng-template>
        </div>

        <ng-container *ngFor="let seg of article.segments">
          <ng-container [ngSwitch]="kind(seg)">
            <app-xyz-converter *ngSwitchCase="'xyz-converter'"></app-xyz-converter>
            <app-gnosis-itinerary *ngSwitchCase="'gnosis-itinerary'" [start]="$any(seg).start" [systems]="$any(seg).systems"></app-gnosis-itinerary>
            <ng-container *ngSwitchDefault>
              <div *ngIf="article.scripts; else plain" class="prose" [appScriptedHtml]="$any(seg).html"></div>
              <ng-template #plain><div class="prose" [innerHTML]="$any(seg).html | articleHtml"></div></ng-template>
            </ng-container>
          </ng-container>
        </ng-container>
      </article>
    </ng-container>
  `,
  styles: [`
    .hero {
      position: relative;
      max-height: 360px;
      overflow: hidden;
    }

    .hero img {
      width: 100%;
      height: 360px;
      object-fit: cover;
      display: block;
    }

    .hero-shade {
      position: absolute;
      inset: 0;
      background: linear-gradient(to bottom, rgba(11, 14, 19, 0) 40%, var(--bg) 100%);
    }

    .article-page {
      padding: 2.5rem 1.5rem 5rem;
    }

    .breadcrumb {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-bottom: 0.75rem;
    }

    h1 {
      font-size: 1.9rem;
    }

    .author {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin: 0.25rem 0 0;
    }

    .meta {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin-bottom: 1rem;
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 2rem;
    }

    .tag {
      background: var(--accent-dim);
      color: var(--accent-light);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.25rem 0.75rem;
      font-size: 0.78rem;
    }

    .tag:hover {
      text-decoration: none;
      border-color: var(--accent);
    }
  `],
})
export class ArticleDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private content = inject(ContentService);

  notFound = false;

  kind(seg: ArticleSegment): string {
    return 'widget' in seg ? seg.widget : 'html';
  }

  article$: Observable<Article | null> = this.route.paramMap.pipe(
    switchMap((params) =>
      this.content.getArticle(params.get('slug')!).pipe(
        tap((article) => {
          this.notFound = false;
          this.redirectToCanonical(article);
        }),
        // Unknown slug (404, or the dev server answering with index.html).
        catchError(() => {
          this.notFound = true;
          return of(null);
        }),
      ),
    ),
  );

  /**
   * Where the article sits in the sorted navigation (home > category > sub).
   * A sub-category with a single article has no page of its own, so it shows
   * as plain text rather than a link; "Everything else" is left out.
   */
  placement$ = combineLatest([this.route.paramMap, this.content.getNavigation(), this.content.getManifest()]).pipe(
    map(([params, nav]) => {
      const slug = params.get('slug')!;
      const places: Placement[] = [];
      for (const cat of nav) {
        const sub = cat.subs.find((s) => s.articles.includes(slug));
        if (sub || cat.articles.includes(slug)) {
          const named = sub && sub.name !== 'Everything else';
          places.push({
            catName: cat.name,
            catLink: ['/topics', cat.slug],
            subName: named ? sub.name : null,
            subLink: named && sub.articles.length > 1 ? ['/topics', cat.slug, sub.slug] : null,
          });
        }
      }
      return places;
    }),
  );

  /** Old and alternate URLs resolve here; keep one address per article. */
  private redirectToCanonical(article: Article): void {
    const canonical = this.router.serializeUrl(this.router.createUrlTree(articleLink(article)));
    const current = this.router.url.split(/[?#]/)[0].replace(/\/+$/, '');
    if (current !== canonical) {
      this.router.navigateByUrl(canonical, { replaceUrl: true });
    }
  }
}
