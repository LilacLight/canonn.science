import { Routes, UrlMatcher } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { ArticleListComponent } from './pages/article-list/article-list.component';
import { ArticleDetailComponent } from './pages/article-detail/article-detail.component';
import { SearchComponent } from './pages/search/search.component';
import { AnalysisComponent } from './pages/analysis/analysis.component';
import { SorterComponent } from './pages/sorter/sorter.component';
import { TopicComponent } from './pages/topics/topic.component';
import { DonateComponent } from './pages/donate/donate.component';
import { NotFoundComponent } from './pages/not-found/not-found.component';

// First path segments owned by the app itself, so an article slug can never
// shadow them.
const RESERVED = new Set(['search', 'category', 'article', 'analysis', 'topics', 'assets', 'donate']);

/**
 * Matches the original canonn.science article URLs:
 *   /<slug>                      standalone pages (about-us, ...)
 *   /<section>/<slug>            codex, news, resources, ...
 *   /codex/<category>/<slug>     a few codex pages
 * The article is looked up by the last segment (its slug); the detail page
 * redirects to the canonical /<section>/<slug> if the URL differs.
 */
export const articleMatcher: UrlMatcher = (segments) => {
  const n = segments.length;
  if (n < 1 || n > 3 || RESERVED.has(segments[0].path)) {
    return null;
  }
  if (n === 3 && segments[0].path !== 'codex') {
    return null;
  }
  return { consumed: segments, posParams: { slug: segments[n - 1] } };
};

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'donate', component: DonateComponent },
  { path: 'codex/donate', redirectTo: 'donate', pathMatch: 'full' },
  { path: 'search', component: SearchComponent },
  { path: 'analysis', component: AnalysisComponent },
  { path: 'analysis/sorter', component: SorterComponent },
  { path: 'topics/:cat', component: TopicComponent },
  { path: 'topics/:cat/:sub', component: TopicComponent },
  { path: 'category/:slug', component: ArticleListComponent },
  // Legacy URL form; redirects to the canonical path once the article loads.
  { path: 'article/:slug', component: ArticleDetailComponent },
  { matcher: articleMatcher, component: ArticleDetailComponent },
  { path: '**', component: NotFoundComponent },
];
