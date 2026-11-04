import { Component } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
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

      <main class="site-main">
        <router-outlet></router-outlet>
      </main>

      <footer class="site-footer">
        <div class="container">
          <p>
            An archive of the Canonn Interstellar Research Group codex, rebuilt from Internet Archive
            snapshots after the original site went offline.
          </p>
          <a routerLink="/donate" class="paypal-donate-link" aria-label="Donate to Canonn">
            <img src="https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif" alt="Donate via PayPal" />
          </a>
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

    .site-footer .paypal-donate-link {
      margin-top: 0.75rem;
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
  constructor(private router: Router) {}

  onSearch(event: Event, value: string): void {
    event.preventDefault();
    const q = value.trim();
    if (q) {
      this.router.navigate(['/search'], { queryParams: { q } });
    }
  }
}
