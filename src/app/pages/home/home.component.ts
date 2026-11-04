import { Component, inject } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ArticleSummary, ContentService } from '../../services/content.service';
import { Tile, TileGridComponent } from '../../components/tile-grid.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [AsyncPipe, NgIf, TileGridComponent],
  template: `
    <section class="hero">
      <div class="container hero-inner">
        <img src="/brand/logo.png" alt="Canonn Interstellar Research Group" class="hero-logo" />
        <p class="hero-tag">
          An archive of the Canonn codex -- xenobiology, archaeology, cartography and research
          notes gathered from the Elite Dangerous galaxy.
        </p>
        <p class="hero-stat" *ngIf="articleCount$ | async as count">{{ count }} articles archived</p>
      </div>
    </section>

    <section class="container categories">
      <h2>Browse by topic</h2>
      <ng-container *ngIf="tiles$ | async as tiles">
        <app-tile-grid *ngIf="tiles.length; else noCategories" [tiles]="tiles"></app-tile-grid>
        <ng-template #noCategories>
          <p class="empty">
            No topics loaded -- check the browser console for a failed request to
            <code>/assets/content/navigation.json</code>.
          </p>
        </ng-template>
      </ng-container>
    </section>
  `,
  styles: [`
    .hero {
      background:
        radial-gradient(ellipse at top, rgba(242, 135, 31, 0.12), transparent 60%),
        var(--bg);
      border-bottom: 1px solid var(--border);
      padding: 3.5rem 0 3rem;
      text-align: center;
    }

    .hero-inner {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .hero-logo {
      max-width: 360px;
      width: 80%;
      margin-bottom: 1.5rem;
    }

    .hero-tag {
      max-width: 620px;
      color: var(--text-muted);
      font-size: 1.05rem;
    }

    .hero-stat {
      color: var(--accent-light);
      font-family: var(--font-display);
      font-weight: 600;
      letter-spacing: 0.02em;
      margin: 0;
    }

    .categories {
      padding: 3rem 1.5rem 4rem;
    }

    .categories h2 {
      font-size: 1.3rem;
      margin-bottom: 1.25rem;
    }

    .empty {
      color: var(--text-muted);
    }

    .empty code {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.1rem 0.4rem;
    }
  `],
})
export class HomeComponent {
  private content = inject(ContentService);

  tiles$: Observable<Tile[]> = this.content.getNavigation().pipe(
    map((cats) =>
      cats.map((c) => ({
        name: c.name,
        count: c.count,
        thumb: c.thumb,
        link: ['/topics', c.slug],
        detail: c.subs.length ? `${c.subs.length} sub-categor${c.subs.length === 1 ? 'y' : 'ies'}` : undefined,
      })),
    ),
  );
  articleCount$: Observable<number> = this.content
    .getManifest()
    .pipe(map((articles: ArticleSummary[]) => articles.length));
}
