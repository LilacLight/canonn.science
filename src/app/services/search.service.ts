import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ContentService, SearchEntry } from './content.service';

export interface SearchResult {
  slug: string;
  section: string | null;
  title: string;
  snippet: string;
  score: number;
}

const SNIPPET_RADIUS = 80;

@Injectable({ providedIn: 'root' })
export class SearchService {
  private content = inject(ContentService);

  search(query: string): Observable<SearchResult[]> {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    return this.content.getSearchIndex().pipe(
      map((entries) => {
        if (terms.length === 0) {
          return [];
        }
        const results: SearchResult[] = [];
        for (const entry of entries) {
          const scored = this.scoreEntry(entry, terms);
          if (scored) {
            results.push(scored);
          }
        }
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, 50);
      }),
    );
  }

  private scoreEntry(entry: SearchEntry, terms: string[]): SearchResult | null {
    const titleLower = entry.title.toLowerCase();
    const textLower = entry.text.toLowerCase();
    let score = 0;
    let firstMatchIndex = -1;

    for (const term of terms) {
      const titleHits = countOccurrences(titleLower, term);
      const textHits = countOccurrences(textLower, term);
      if (titleHits === 0 && textHits === 0) {
        return null; // require every term to appear somewhere (AND match)
      }
      score += titleHits * 8 + textHits;
      if (firstMatchIndex === -1) {
        const idx = textLower.indexOf(term);
        if (idx !== -1) {
          firstMatchIndex = idx;
        }
      }
    }

    return {
      slug: entry.slug,
      section: entry.section,
      title: entry.title,
      snippet: buildSnippet(entry.text, firstMatchIndex),
      score,
    };
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  let count = 0;
  let pos = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) {
      break;
    }
    count++;
    pos = idx + needle.length;
  }
  return count;
}

function buildSnippet(text: string, aroundIndex: number): string {
  if (aroundIndex === -1) {
    return text.slice(0, SNIPPET_RADIUS * 2) + (text.length > SNIPPET_RADIUS * 2 ? '…' : '');
  }
  const start = Math.max(0, aroundIndex - SNIPPET_RADIUS);
  const end = Math.min(text.length, aroundIndex + SNIPPET_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).trim() + suffix;
}
