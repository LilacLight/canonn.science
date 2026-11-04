import { Component, Input } from '@angular/core';
import { DatePipe, NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ArticleSummary, articleLink } from '../services/content.service';

/** A grid of article cards. */
@Component({
  selector: 'app-article-grid',
  standalone: true,
  imports: [DatePipe, NgFor, NgIf, RouterLink],
  template: `
    <div class="article-grid">
      <a class="card" *ngFor="let article of articles" [routerLink]="articleLink(article)">
        <div class="card-media">
          <img *ngIf="article.banner_image" [src]="article.banner_image" alt="" loading="lazy" />
        </div>
        <div class="card-body">
          <h3>{{ article.title }}</h3>
          <p class="card-date" *ngIf="article.date">{{ article.date | date: 'longDate' }}</p>
          <div class="card-excerpt">{{ article.excerpt }}</div>
        </div>
      </a>
      <p class="empty" *ngIf="articles.length === 0">No articles here yet.</p>
    </div>
  `,
  styles: [`
    .article-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1.25rem; }
    .card {
      display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); overflow: hidden; color: var(--text); transition: border-color 0.15s, transform 0.15s;
    }
    .card:hover { text-decoration: none; border-color: var(--accent); transform: translateY(-2px); }
    .card-media { aspect-ratio: 16 / 9; overflow: hidden; background: var(--surface-raised); }
    .card-media img { width: 100%; height: 100%; object-fit: cover; }
    .card-body { padding: 1.1rem 1.25rem 1.3rem; }
    .card-body h3 { font-size: 1.02rem; margin-bottom: 0.3rem; }
    .card-date { color: var(--text-muted); font-size: 0.78rem; margin: 0 0 0.5rem; }
    .card-excerpt {
      color: var(--text-muted); font-size: 0.88rem; display: -webkit-box; -webkit-line-clamp: 3;
      -webkit-box-orient: vertical; overflow: hidden;
    }
    .empty { color: var(--text-muted); }
  `],
})
export class ArticleGridComponent {
  articleLink = articleLink;
  @Input({ required: true }) articles: ArticleSummary[] = [];
}
