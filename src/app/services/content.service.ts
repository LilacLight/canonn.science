import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import type { ArticleSegment } from './article-html';

export interface Category {
  name: string;
  slug: string;
  count?: number;
  /** Banner image of the most recent article in this topic that has one. */
  image?: string | null;
  latest_date?: string | null;
}

export interface ArticleSummary {
  slug: string;
  /** First segment of the original canonn.science URL (codex, news, pages, ...). */
  section: string | null;
  title: string;
  date: string | null;
  /** Last real change: newest of `date`, `modified` and the last git change. */
  updated?: string | null;
  /** Plain text. */
  excerpt: string;
  categories: Category[];
  banner_image: string | null;
  source: string;
}

export interface Article extends ArticleSummary {
  modified: string | null;
  author: string | null;
  /** Sanitised HTML and widget segments, prepared by tools/build-content.mjs. */
  segments: ArticleSegment[];
  /** True when the article's author opted in to running scripts (reviewed by a maintainer). */
  scripts: boolean;
  original_link: string | null;
}

/** The home > category > sub-category tree, built by tools/build-content.mjs. */
export interface NavSub {
  name: string;
  slug: string;
  thumb: string | null;
  count: number;
  /** Article slugs, newest first. */
  articles: string[];
}

export interface NavCategory {
  name: string;
  slug: string;
  description?: string | null;
  thumb: string | null;
  count: number;
  subs: NavSub[];
  /** Articles shown directly in a category that has no sub-categories. */
  articles: string[];
}

/** One entry of the "recently added / updated" ticker. */
export interface RecentItem {
  slug: string;
  section: string | null;
  title: string;
  created: string | null;
  updated: string | null;
  kind: 'new' | 'updated';
}

export interface SearchEntry {
  slug: string;
  section: string | null;
  title: string;
  categories: string[];
  text: string;
}

/**
 * routerLink commands for an article, mirroring its original canonn.science
 * path: /<section>/<slug>, or just /<slug> for standalone pages.
 */
export function articleLink(a: { slug: string; section: string | null }): string[] {
  if (!a.section) {
    return ['/article', a.slug];
  }
  return a.section === 'pages' ? ['/', a.slug] : ['/', a.section, a.slug];
}

@Injectable({ providedIn: 'root' })
export class ContentService {
  private http = inject(HttpClient);

  // If any of these 404s (e.g. the pipeline hasn't been rerun since a field
  // was added, or the dev server was never restarted to pick up a new
  // angular.json asset glob), fail loud in the console instead of leaving
  // the async pipe silently stuck with nothing to show.
  private manifest$ = this.http.get<ArticleSummary[]>('/assets/content/manifest.json').pipe(
    tap({ error: (err) => console.error('Failed to load manifest.json', err) }),
    catchError(() => of([] as ArticleSummary[])),
    shareReplay(1),
  );

  private categories$ = this.http.get<Category[]>('/assets/content/categories.json').pipe(
    tap({ error: (err) => console.error('Failed to load categories.json', err) }),
    catchError(() => of([] as Category[])),
    shareReplay(1),
  );

  private navFile$ = this.http.get<{ categories: NavCategory[]; recent?: RecentItem[] }>('/assets/content/navigation.json').pipe(
    tap({ error: (err) => console.error('Failed to load navigation.json', err) }),
    shareReplay(1),
  );

  private navigation$ = this.navFile$.pipe(
    map((n) => n.categories),
    tap({ error: (err) => console.error('Failed to load navigation.json', err) }),
    catchError(() => of([] as NavCategory[])),
    shareReplay(1),
  );

  private searchIndex$ = this.http.get<SearchEntry[]>('/assets/content/search-index.json').pipe(
    tap({ error: (err) => console.error('Failed to load search-index.json', err) }),
    catchError(() => of([] as SearchEntry[])),
    shareReplay(1),
  );

  getManifest(): Observable<ArticleSummary[]> {
    return this.manifest$;
  }

  /** Kept for callers written against the old pipeline: the manifest already carries navigation categories. */
  getSortedManifest(): Observable<ArticleSummary[]> {
    return this.manifest$;
  }

  getCategories(): Observable<Category[]> {
    return this.categories$;
  }

  getNavigation(): Observable<NavCategory[]> {
    return this.navigation$;
  }

  /** The ten most recently added or updated articles, newest first. */
  getRecent(): Observable<RecentItem[]> {
    return this.navFile$.pipe(map((n) => n.recent ?? []), catchError(() => of([] as RecentItem[])));
  }

  getSearchIndex(): Observable<SearchEntry[]> {
    return this.searchIndex$;
  }

  getArticle(slug: string): Observable<Article> {
    return this.http.get<Article>(`/assets/content/articles/${slug}.json`);
  }
}
