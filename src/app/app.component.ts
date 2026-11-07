import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { ContentService, RecentItem, articleLink } from './services/content.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, AsyncPipe],
  template: `
    <div class="shell">
      <header class="site-header">
        <div class="container header-row">
          <a class="brand" routerLink="/">
            <img src="/brand/icon.png" alt="" class="brand-icon" />
            <span class="brand-text">
              <strong>CANONN</strong>
              <small>Interstellar Research Group</small>
            </span>
          </a>
          <form class="search-form" (submit)="onSearch($event, searchInput.value)">
            <input
              #searchInput
              type="search"
              name="q"
              placeholder="Search the archive…"
              autocomplete="off"
            />
            <button type="submit" aria-label="Search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
          </form>
          <a routerLink="/donate" class="paypal-donate-link" aria-label="Donate to Canonn">
            <img src="https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif" alt="Donate via PayPal" />
          </a>
        </div>
      </header>

      @if (recent$ | async; as recent) {
        @if (recent.length) {
          <div class="ticker" role="region" aria-label="Recently added and updated articles">
            <div class="ticker-track">
              @for (copy of [0, 1]; track copy) {
                <ul class="ticker-list" [attr.aria-hidden]="copy === 1 ? 'true' : null">
                  @for (r of recent; track r.slug) {
                    <li>
                      <span class="badge" [class.badge-new]="r.kind === 'new'">{{ r.kind === 'new' ? 'New' : 'Updated' }}</span>
                      <a [routerLink]="link(r)" [attr.tabindex]="copy === 1 ? -1 : null">{{ r.title }}</a>
                      <time>{{ ago(r.updated) }}</time>
                    </li>
                  }
                </ul>
              }
            </div>
          </div>
        }
      }

      <main class="site-main">
        <router-outlet></router-outlet>
      </main>

      <footer class="site-footer">
        <div class="container">
          <p>
            An archive of the Canonn Interstellar Research Group codex, rebuilt from Internet Archive
            snapshots after the original site went offline.
          </p>
          <div class="footer-actions">
            <a routerLink="/donate" class="paypal-donate-link" aria-label="Donate to Canonn">
              <img src="https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif" alt="Donate via PayPal" />
            </a>
            <a routerLink="/discord" class="footer-link">Discord</a>
            <a href="https://bsky.app/profile/canonn.science" class="footer-link" target="_blank" rel="noopener">Bluesky</a>
          </div>
        </div>
      </footer>
    </div>
  `,
  styles: [`
    .shell {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .site-header {
      position: sticky;
      top: 0;
      z-index: 10;
      background: rgba(11, 14, 19, 0.92);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
    }

    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      padding: 0.85rem 1.5rem;
      flex-wrap: wrap;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      color: var(--text);
    }

    .brand:hover {
      text-decoration: none;
    }

    .brand-icon {
      width: 34px;
      height: 34px;
    }

    .brand-text {
      display: flex;
      flex-direction: column;
      line-height: 1.1;
      font-family: var(--font-display);
    }

    .brand-text strong {
      font-size: 1.1rem;
      letter-spacing: 0.06em;
      color: var(--accent-light);
    }

    .brand-text small {
      font-size: 0.68rem;
      color: var(--text-muted);
      letter-spacing: 0.04em;
    }

    .search-form {
      display: flex;
      align-items: center;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.3rem 0.4rem 0.3rem 0.9rem;
      flex: 1 1 260px;
      max-width: 420px;
    }

    .search-form input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text);
      font-family: var(--font-body);
      font-size: 0.9rem;
    }

    .search-form input::placeholder {
      color: var(--text-muted);
    }

    .search-form button {
      background: var(--accent);
      border: none;
      color: #0b0e13;
      width: 30px;
      height: 30px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    }

    .search-form button:hover {
      background: var(--accent-light);
    }

    .paypal-donate-link {
      display: inline-flex;
      flex-shrink: 0;
    }

    .paypal-donate-link img {
      display: block;
      height: 25px;
      width: auto;
    }

    .footer-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem;
      margin-top: 0.75rem;
    }

    .footer-link {
      color: var(--accent-light);
      font-size: 0.9rem;
    }

    .ticker {
      overflow: hidden;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      font-size: 0.82rem;
    }

    .ticker-track {
      display: flex;
      width: max-content;
      animation: ticker-scroll 90s linear infinite;
    }

    .ticker:hover .ticker-track,
    .ticker:focus-within .ticker-track {
      animation-play-state: paused;
    }

    .ticker-list {
      display: flex;
      flex-shrink: 0;
      margin: 0;
      padding: 0.45rem 0;
      list-style: none;
    }

    .ticker-list li {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      white-space: nowrap;
      padding: 0 1.25rem;
      border-right: 1px solid var(--border);
    }

    .ticker-list a {
      color: var(--text);
    }

    .ticker-list time {
      color: var(--text-muted);
    }

    .badge {
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      padding: 0.1rem 0.45rem;
      border-radius: 999px;
      color: var(--text);
      border: 1px solid var(--text-muted);
    }

    .badge-new {
      background: var(--accent);
      border-color: var(--accent);
      color: #0b0e13;
    }

    @keyframes ticker-scroll {
      to { transform: translateX(-50%); }
    }

    @media (prefers-reduced-motion: reduce) {
      .ticker { overflow-x: auto; }
      .ticker-track { animation: none; }
      .ticker-list[aria-hidden='true'] { display: none; }
    }

    .site-main {
      flex: 1;
    }

    .site-footer {
      border-top: 1px solid var(--border);
      padding: 1.5rem 0;
      color: var(--text-muted);
      font-size: 0.8rem;
    }
  `],
})
export class AppComponent {
  private router = inject(Router);
  recent$ = inject(ContentService).getRecent();

  link(r: RecentItem): string[] {
    return articleLink(r);
  }

  /** "today", "yesterday", "3 days ago", "2 months ago". */
  ago(iso: string | null): string {
    const t = iso ? Date.parse(iso) : NaN;
    if (Number.isNaN(t)) return '';
    const days = Math.floor((Date.now() - t) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days} days ago`;
    if (days < 365) return `${Math.floor(days / 30)} month${days >= 60 ? 's' : ''} ago`;
    return `${Math.floor(days / 365)} year${days >= 730 ? 's' : ''} ago`;
  }

  onSearch(event: Event, value: string): void {
    event.preventDefault();
    const q = value.trim();
    if (q) {
      this.router.navigate(['/search'], { queryParams: { q } });
    }
  }
}
