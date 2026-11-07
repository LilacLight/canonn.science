import { Component, inject } from '@angular/core';
import { AsyncPipe, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ArticleSummary, ContentService } from '../../services/content.service';
import { Tile, TileGridComponent } from '../../components/tile-grid.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [AsyncPipe, NgIf, RouterLink, TileGridComponent],
  template: `
    <section class="hero">
      <div class="container hero-inner">
        <p>
          <strong>Canonn Interstellar Research Group</strong> (or the &lsquo;Canonn&rsquo; for short) is an
          independent cooperative made up of thousands of Commanders committed to science and discovering
          the mysteries of the universe. Founded in Varati on August 4th 3301 the Canonn has continued to
          spread and is even present in Colonia.
        </p>
        <p>
          We are a non-exclusive, open group that does not take part in politics and is adamantly neutral,
          we believe anything that distracts from our research is to be avoided. We do not restrict our
          pilots but we do enforce that any overtly political actions are not taken in our name.
        </p>
        <p>
          You can find all our research in these pages and we encourage anyone seeking to work with us to
          <a routerLink="/how-to-join">join us</a>, take part in our
          <a routerLink="/discord">discord</a> Be forewarned there will be
          plenty of off the wall &ldquo;tinfoil&rdquo; theories and talk of biscuits but that&rsquo;s just an
          average day around here. Join us, discover the ongoing mysteries, and make some new friends!
        </p>
      </div>
    </section>

    <section class="container categories" id="topics">
      <ng-container *ngIf="tiles$ | async as tiles">
      <div class="categories-head">
        <h2>Browse by topic</h2>
        <p class="hero-stat">{{ tiles.length }} topics<ng-container *ngIf="articleCount$ | async as count"> &middot; {{ count }} articles archived</ng-container></p>
      </div>
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
      padding: 1.25rem 0 1rem;
      text-align: center;
    }

    .hero-inner {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .hero h1 {
      font-size: 1.4rem;
      margin: 0 0 0.5rem;
    }

    .hero-inner {
      align-items: stretch;
    }

    .hero-inner p {
      max-width: none;
      width: 100%;
      color: var(--text-muted);
      font-size: 0.85rem;
      line-height: 1.45;
      margin: 0 0 0.5rem;
      text-align: left;
    }

    .hero-inner a {
      color: var(--accent-light);
    }

    .hero-stat {
      color: var(--accent-light);
      font-family: var(--font-display);
      font-weight: 600;
      letter-spacing: 0.02em;
      margin: 0;
      text-align: left;
    }

    .categories {
      padding: 1.5rem 1.5rem 3rem;
    }

    .categories-head {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      margin-bottom: 1.25rem;
    }

    .categories-head h2,
    .categories-head p {
      margin: 0;
    }

    .categories h2 {
      font-size: 1.3rem;
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
  scrollToTopics(event: Event): void {
    event.preventDefault();
    document.getElementById('topics')?.scrollIntoView({ behavior: 'smooth' });
  }

  articleCount$: Observable<number> = this.content
    .getManifest()
    .pipe(map((articles: ArticleSummary[]) => articles.length));
}
