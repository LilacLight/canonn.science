import { Directive, ElementRef, Input, OnChanges, OnDestroy, Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import policy from '../../../content-policy.json';

/**
 * Article HTML is already sanitised at build time (tools/lib/policy.mjs), against the same
 * content-policy.json. This is a second, independent pass in the browser: Angular's built-in
 * [innerHTML] sanitiser removes every <iframe>, so embeds are kept here from the policy's host
 * list, and anything that could run code is stripped again.
 */
const EMBED_HOSTS: string[] = policy.embedHosts;

function allowedEmbed(src: string): boolean {
  try {
    const url = new URL(src, 'https://canonn.science');
    return url.protocol === 'https:' && EMBED_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

/** Returns article HTML with only the embeds above kept; scripts, handlers and javascript: URLs removed. */
export function cleanArticleHtml(html: string, scripts = false): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Articles that opted in to scripts (article.json "scripts": true) keep script, style and form.
  doc.querySelectorAll(scripts ? 'object, embed, link, meta, base' : 'script, style, object, embed, link, meta, base, form').forEach((el) => el.remove());
  doc.querySelectorAll('iframe').forEach((frame) => {
    const src = frame.getAttribute('src') ?? '';
    if (/^\/assets\/media\/[^?#:\\]*\.pdf$/i.test(src) && !src.includes('..')) {
      // Our own PDF: a sandboxed frame would block the browser's PDF viewer.
      frame.setAttribute('loading', 'lazy');
      frame.setAttribute('title', frame.getAttribute('title') ?? 'PDF document');
      return;
    }
    if (!allowedEmbed(src)) {
      frame.remove();
      return;
    }
    frame.setAttribute('loading', 'lazy');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-presentation');
  });
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if ((!scripts && name.startsWith('on')) || ((name === 'href' || name === 'src' || name === 'xlink:href') && value.startsWith('javascript:'))) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

/** One piece of an article: sanitised HTML, or a fixed interactive component (decided at build time). */
export type ArticleSegment =
  | { html: string }
  | { widget: 'xyz-converter' }
  | { widget: 'gnosis-itinerary'; start: [number, number, number]; systems: { name: string; week: number }[] };

@Pipe({ name: 'articleHtml', standalone: true })
export class ArticleHtmlPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(html: string | null | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(cleanArticleHtml(html ?? ''));
  }
}

/**
 * Renders HTML from an article that opted in to scripts. Angular never executes scripts that arrive
 * through [innerHTML], so each <script> is re-created, one at a time and in order (a library such as
 * jQuery must finish loading before the inline code that uses it runs).
 */
@Directive({ selector: '[appScriptedHtml]', standalone: true })
export class ScriptedHtmlDirective implements OnChanges, OnDestroy {
  @Input() appScriptedHtml = '';
  private el = inject(ElementRef<HTMLElement>);
  private generation = 0;

  ngOnChanges(): void {
    const host = this.el.nativeElement as HTMLElement;
    const run = ++this.generation;
    host.innerHTML = cleanArticleHtml(this.appScriptedHtml, true);
    void this.activate(host, run);
  }

  ngOnDestroy(): void {
    this.generation++;
  }

  private async activate(host: HTMLElement, run: number): Promise<void> {
    for (const old of Array.from(host.querySelectorAll('script'))) {
      if (run !== this.generation) {
        return;
      }
      const fresh = document.createElement('script');
      for (const attr of Array.from(old.attributes)) {
        fresh.setAttribute(attr.name, attr.value);
      }
      fresh.textContent = old.textContent;
      if (old.src) {
        await new Promise<void>((resolve) => {
          fresh.addEventListener('load', () => resolve());
          fresh.addEventListener('error', () => resolve());
          old.replaceWith(fresh);
        });
      } else {
        old.replaceWith(fresh);
      }
    }
  }
}
