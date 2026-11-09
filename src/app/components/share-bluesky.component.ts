import { Component, Input, inject } from '@angular/core';
import { Router } from '@angular/router';

/** Public origin, used so shared links never point at localhost. Keep in step with public/CNAME. */
export const SITE_ORIGIN = 'https://science.canonn.tech';

/**
 * "Share on Bluesky" link, using Bluesky's compose intent. The intent only pre-fills text; the
 * preview card (title, excerpt, banner) is built by Bluesky from the Open Graph tags that
 * tools/generate-share-pages.mjs writes into the static page for this URL.
 */
@Component({
  selector: 'app-share-bluesky',
  standalone: true,
  template: `
    <a class="share-bsky" [href]="href" target="_blank" rel="noopener noreferrer" title="Share on Bluesky">
      <svg viewBox="0 0 600 530" width="16" height="14" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z"/>
      </svg>
      Share on Bluesky
    </a>
  `,
  styles: [`
    .share-bsky {
      display: inline-flex; align-items: center; gap: 0.45rem;
      padding: 0.35rem 0.75rem; border-radius: 999px;
      border: 1px solid var(--border, rgba(255,255,255,0.2));
      color: inherit; text-decoration: none; font-size: 0.85rem;
    }
    .share-bsky:hover { border-color: #1185fe; color: #1185fe; }
  `],
})
export class ShareBlueskyComponent {
  private router = inject(Router);
  /** Text placed before the link in the post. */
  @Input() text = '';

  get href(): string {
    const path = this.router.url.split(/[?#]/)[0];
    const post = `${this.text ? this.text + '\n\n' : ''}${SITE_ORIGIN}${path}`;
    return 'https://bsky.app/intent/compose?text=' + encodeURIComponent(post);
  }
}
