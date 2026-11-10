import { Component, inject } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { ArticleSummary, ContentService, NavCategory } from '../../services/content.service';
import { Tile, TileGridComponent } from '../../components/tile-grid.component';
import { ArticleGridComponent } from '../../components/article-grid.component';
import { ShareBlueskyComponent } from '../../components/share-bluesky.component';
import { NotFoundComponent } from '../not-found/not-found.component';

interface View {
  category: NavCategory;
  /** Set on /topics/:cat/:sub. */
  subName: string | null;
  tiles: Tile[] | null;
  articles: ArticleSummary[] | null;
}

/**
 * /topics/:cat           sub-category tiles (or the articles, if it has none)
 * /topics/:cat/:sub      the articles in one sub-category
 */
@Component({
  selector: 'app-topic',
  standalone: true,
  imports: [AsyncPipe, NgIf, RouterLink, ShareBlueskyComponent, TileGridComponent, ArticleGridComponent, NotFoundComponent],
  template: `
    <ng-container *ngIf="view$ | async as v">
      <app-not-found *ngIf="v === 'missing'"></app-not-found>
      <section class="container topic-page" *ngIf="v !== 'missing'">
        <nav class="breadcrumb">
          <a routerLink="/">Home</a> /
          <ng-container *ngIf="v.subName; else here">
            <a [routerLink]="['/topics', v.category.slug]">{{ v.category.name }}</a> / {{ v.subName }}
          </ng-container>
          <ng-template #here>{{ v.category.name }}</ng-template>
        </nav>
        <h1>{{ v.subName || v.category.name }}</h1>
        <p class="share"><app-share-bluesky [text]="v.subName || v.category.name"></app-share-bluesky></p>
        <p class="description" *ngIf="!v.subName && v.category.description">{{ v.category.description }}</p>
        <app-tile-grid *ngIf="v.tiles" [tiles]="v.tiles"></app-tile-grid>
        <h2 class="direct" *ngIf="v.tiles && v.articles">Articles</h2>
        <app-article-grid *ngIf="v.articles" [articles]="v.articles"></app-article-grid>
      </section>
    </ng-container>
  `,
  styles: [`
    .topic-page { padding: 2.5rem 1.5rem 4rem; }
    .breadcrumb { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.6rem; }
    h1 { margin-bottom: 0.75rem; }
    .share { margin: 0 0 1rem; }
    .description { max-width: 720px; color: var(--text-muted); margin-bottom: 1.75rem; }
    .direct { font-size: 1.15rem; margin: 2.5rem 0 1rem; }
  `],
})
export class TopicComponent {
  private route = inject(ActivatedRoute);
  private content = inject(ContentService);

  view$: Observable<View | 'missing' | null> = combineLatest([
    this.route.paramMap,
    this.content.getNavigation(),
    this.content.getManifest(),
  ]).pipe(
    map(([params, nav, manifest]): View | 'missing' | null => {
      const category = nav.find((c) => c.slug === params.get('cat'));
      if (!category) {
        return nav.length ? 'missing' : null;
      }
      const bySlug = new Map(manifest.map((a) => [a.slug, a]));
      const toArticles = (slugs: string[]) => slugs.map((s) => bySlug.get(s)).filter((a): a is ArticleSummary => !!a);
      const subSlug = params.get('sub');

      if (subSlug) {
        const sub = category.subs.find((s) => s.slug === subSlug);
        return sub ? { category, subName: sub.name, tiles: null, articles: toArticles(sub.articles) } : 'missing';
      }
      if (category.subs.length === 0) {
        return { category, subName: null, tiles: null, articles: toArticles(category.articles) };
      }
      // A sub-category with a single article isn't worth a page of its own:
      // show that article directly in the category.
      const multi = category.subs.filter((s) => s.articles.length > 1);
      const singles = category.subs.filter((s) => s.articles.length === 1).flatMap((s) => s.articles);
      const tiles: Tile[] = multi.map((s) => ({
        name: s.name,
        count: s.count,
        thumb: s.thumb,
        link: ['/topics', category.slug, s.slug],
      }));
      const pinned = (a: ArticleSummary) => a.categories.some((c) => c.slug === category.slug && c.pinned);
      const direct = toArticles(singles).sort((a, b) => Number(pinned(b)) - Number(pinned(a)) || (b.date ?? '').localeCompare(a.date ?? ''));
      return { category, subName: null, tiles: tiles.length ? tiles : null, articles: direct.length ? direct : null };
    }),
  );
}
