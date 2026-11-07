import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { AsyncPipe, NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { ContentService, RecentItem, articleLink } from './services/content.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, AsyncPipe, NgTemplateOutlet],
  template: `
    <ng-template #socials>
      <a routerLink="/discord" class="social-icon" aria-label="Canonn on Discord" title="Discord">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
      </a>
      <a href="https://bsky.app/profile/canonn.science" class="social-icon" target="_blank" rel="noopener" aria-label="Canonn on Bluesky" title="Bluesky">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"/></svg>
      </a>
    </ng-template>
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
          <div class="header-socials">
            <a routerLink="/donate" class="paypal-donate-link" aria-label="Donate to Canonn">
              <img src="https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif" alt="Donate via PayPal" />
            </a>
            <ng-container *ngTemplateOutlet="socials"></ng-container>
          </div>
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
            <ng-container *ngTemplateOutlet="socials"></ng-container>
            <button type="button" class="footer-btn" (click)="openReport()">Report a problem</button>
            <a class="footer-btn" [href]="submitArticleUrl" target="_blank" rel="noopener">Submit an article</a>
          </div>
        </div>
      </footer>

      <dialog #reportDialog class="report-dialog" aria-labelledby="report-title" (click)="onDialogClick($event)">
        <h2 id="report-title">Report a problem</h2>
        <p class="report-page">About: <strong>{{ pageTitle }}</strong></p>
        <p>What kind of problem is it? This opens a pre-filled GitHub issue (a free GitHub account is needed).</p>
        <div class="report-options">
          @for (o of reportOptions; track o.label) {
            <a class="report-option" [href]="issueUrl(o)" target="_blank" rel="noopener" (click)="closeReport()">{{ o.label }}</a>
          }
        </div>
        <button type="button" class="report-cancel" (click)="closeReport()">Cancel</button>
      </dialog>
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

    .footer-btn {
      background: transparent;
      border: 1px solid var(--accent);
      color: var(--accent-light);
      border-radius: 999px;
      padding: 0.3rem 0.9rem;
      font: inherit;
      cursor: pointer;
    }

    .footer-btn:hover,
    .footer-btn:focus-visible {
      background: var(--accent);
      color: #0b0e13;
      text-decoration: none;
    }

    .report-dialog {
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.5rem;
      max-width: 440px;
      width: calc(100% - 2rem);
    }

    .report-dialog::backdrop {
      background: rgba(0, 0, 0, 0.65);
    }

    .report-dialog h2 {
      margin: 0 0 0.5rem;
    }

    .report-options {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin: 1rem 0;
    }

    .report-option {
      display: block;
      padding: 0.6rem 1rem;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
    }

    .report-option:hover,
    .report-option:focus-visible {
      border-color: var(--accent);
      background: rgba(255, 255, 255, 0.05);
      text-decoration: none;
    }

    .report-cancel {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font: inherit;
      padding: 0;
    }

    .header-socials {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .social-icon {
      display: inline-flex;
      color: var(--accent-light);
    }

    .social-icon:hover,
    .social-icon:focus-visible {
      color: var(--accent);
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

  @ViewChild('reportDialog') private dialog!: ElementRef<HTMLDialogElement>;

  private readonly repo = 'https://github.com/canonn-science/canonn.science/issues/new';
  readonly submitArticleUrl = `${this.repo}?template=article-.md`;
  pageTitle = '';
  private pageUrl = '';

  readonly reportOptions = [
    { label: 'Something went wrong', template: 'bug--.md', prefix: 'Bug', detail: 'Something went wrong on this page.' },
    { label: 'This article is inaccurate', template: 'correction--.md', prefix: 'Correction', detail: 'This article is inaccurate.\n\nWhat is wrong, and what should it say?\n' },
    { label: 'This article is incomplete', template: 'correction--.md', prefix: 'Correction', detail: 'This article is incomplete.\n\nWhat is missing?\n' },
    { label: 'Images are missing', template: 'correction--.md', prefix: 'Correction', detail: 'Images are missing or broken in this article.\n\nWhich images?\n' },
  ];

  openReport(): void {
    const h1 = document.querySelector('main h1')?.textContent?.trim();
    this.pageTitle = h1 || document.title;
    this.pageUrl = location.href;
    this.dialog.nativeElement.showModal();
  }

  closeReport(): void {
    this.dialog.nativeElement.close();
  }

  /** Clicking the backdrop (the dialog element itself) closes it. */
  onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog.nativeElement) this.closeReport();
  }

  issueUrl(o: { template: string; prefix: string; detail: string }): string {
    const title = `${o.prefix}: ${this.pageTitle}`;
    const body = `## Page\n${this.pageTitle}\n${this.pageUrl}\n\n## Details\n${o.detail}`;
    const q = new URLSearchParams({ template: o.template, title, body });
    return `${this.repo}?${q.toString()}`;
  }

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
