import { Component, inject } from '@angular/core';
import { AsyncPipe, DatePipe, NgFor, NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Observable, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap, tap } from 'rxjs/operators';
import { Article, ContentService, articleLink } from '../../services/content.service';
import { ArticleHtmlPipe, ArticleSegment, ScriptedHtmlDirective } from '../../services/article-html';
import { XyzConverterComponent } from '../../widgets/xyz-converter.component';
import { HesperusDecoderComponent } from '../../widgets/hesperus-decoder.component';
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
  imports: [AsyncPipe, DatePipe, NgIf, NgFor, RouterLink, NotFoundComponent, ArticleHtmlPipe, ScriptedHtmlDirective, XyzConverterComponent, HesperusDecoderComponent, GnosisItineraryComponent, NgSwitch, NgSwitchCase, NgSwitchDefault],
  template: `
    <ng-container *ngIf="reviewMode && (review$ | async) as r">
      <div class="review-bar">
        <a class="btn" *ngIf="r.prev; else noPrev" [routerLink]="['/review', r.prev.slug]">&larr; Prev</a>
        <ng-template #noPrev><span class="btn disabled">&larr; Prev</span></ng-template>
        <span class="review-pos">{{ r.index + 1 }} / {{ r.total }}</span>
        <a class="btn" *ngIf="r.next; else noNext" [routerLink]="['/review', r.next.slug]">Next &rarr;</a>
        <ng-template #noNext><span class="btn disabled">Next &rarr;</span></ng-template>
        <a class="btn bug" [href]="r.bugUrl" target="_blank" rel="noopener">Report bug</a>
      </div>
    </ng-container>
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
            <app-hesperus-decoder *ngSwitchCase="'hesperus-decoder'"></app-hesperus-decoder>
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
  host: { '(click)': 'onAnchorClick($event)' },
  styles: [`
    .review-bar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 0.5rem 1rem;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }

    .review-bar .btn {
      background: var(--accent-dim);
      color: var(--accent-light);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.35rem 0.9rem;
      font-size: 0.85rem;
    }

    .review-bar a.btn:hover {
      text-decoration: none;
      border-color: var(--accent);
    }

    .review-bar .btn.disabled {
      opacity: 0.4;
    }

    .review-pos {
      color: var(--text-muted);
      font-size: 0.85rem;
    }

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

  /**
   * Same-page links like href="#3" would resolve against <base href="/"> and send the router to the
   * home page. Scroll to the target on this page instead and keep the fragment in the address bar.
   */
  onAnchorClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const link = (event.target as Element | null)?.closest?.('a');
    const href = link?.getAttribute('href');
    if (!link || !href || !href.startsWith('#') || href.length < 2) {
      return;
    }
    event.preventDefault();
    const id = decodeURIComponent(href.slice(1));
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(history.state, '', location.pathname + location.search + href);
  }

  kind(seg: ArticleSegment): string {
    return 'widget' in seg ? seg.widget : 'html';
  }

  /** True under /review, where the canonical redirect is skipped and a navigation bar is shown. */
  reviewMode = !!this.route.snapshot.data['review'];

  /** Articles newest first (undated last), the order the review pager walks. */
  private sorted$ = this.content.getManifest().pipe(
    map((m) => [...m].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))),
    shareReplay(1),
  );

  /** Slug from the URL; bare /review resolves to the most recent article. */
  private slug$: Observable<string> = this.route.paramMap.pipe(
    switchMap((params) => {
      const slug = params.get('slug');
      if (slug || !this.reviewMode) {
        return of(slug!);
      }
      return this.sorted$.pipe(
        tap((list) => {
          if (list.length) {
            this.router.navigate(['/review', list[0].slug], { replaceUrl: true });
          }
        }),
        switchMap(() => EMPTY),
      );
    }),
  );

  article$: Observable<Article | null> = this.slug$.pipe(
    switchMap((slug) =>
      this.content.getArticle(slug).pipe(
        tap((article) => {
          this.notFound = false;
          if (!this.reviewMode) {
            this.redirectToCanonical(article);
          }
        }),
        // Unknown slug (404, or the dev server answering with index.html).
        catchError(() => {
          this.notFound = true;
          return of(null);
        }),
      ),
    ),
  );

  /** Prev is newer, next is older; plus a prefilled GitHub bug report for the page. */
  review$ = combineLatest([this.slug$, this.sorted$, this.article$]).pipe(
    map(([slug, list, article]) => {
      const index = list.findIndex((a) => a.slug === slug);
      const title = article?.title ?? list[index]?.title ?? slug;
      const pageUrl = article
        ? location.origin + this.router.serializeUrl(this.router.createUrlTree(articleLink(article)))
        : location.href;
      const body = `**Page:** ${pageUrl}

**Describe the bug**

**To Reproduce**

**Expected behavior**
`;
      const params = new URLSearchParams({ title: `Bug: ${title}`, body, labels: 'bug' });
      return {
        index,
        total: list.length,
        prev: index > 0 ? list[index - 1] : null,
        next: index >= 0 && index < list.length - 1 ? list[index + 1] : null,
        bugUrl: `https://github.com/canonn-science/canonn.science/issues/new?${params}`,
      };
    }),
  );

  /**
   * Where the article sits in the sorted navigation (home > category > sub).
   * A sub-category with a single article has no page of its own, so it shows
   * as plain text rather than a link; "Everything else" is left out.
   */
  placement$ = combineLatest([this.slug$, this.content.getNavigation(), this.content.getManifest()]).pipe(
    map(([slug, nav]) => {
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
