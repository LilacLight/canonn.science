import { SearchEntry } from '../../services/content.service';

/**
 * Distinctive-word analysis over the article bodies (search-index text).
 *
 * A word's score for a group is how common it is inside the group multiplied
 * by how rare it is across the whole archive (document-frequency x idf), so
 * "system" or "canonn" -- present everywhere -- fall away and the words that
 * characterise the group rise.
 */

const STOPWORDS = new Set(
  `a about above after again against all also am an and any are aren as at be because been before being below between both but by can cannot could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up upon very was we were what when where which while who whom why will with would you your yours yourself yourselves
also may might must shall one two three first second new many much even however still yet get got make made see seen use used using like well way within without every another around among onto per via etc
can't don't didn't doesn't isn't wasn't weren't won't wouldn't couldn't shouldn't haven't hasn't hadn't aren't it's that's there's here's what's who's let's i'm i've i'll i'd you're you've you'll you'd we're we've we'll we'd they're they've they'll they'd he's she's
read click link post posted comment comments share tweet facebook twitter reddit youtube image images video https http www com html`
    .split(/\s+/)
    .filter(Boolean),
);

const TOKEN_RE = /[a-z][a-z'-]*[a-z]/g;

export interface TermScore {
  term: string;
  /** Articles in the group containing the term. */
  df: number;
  score: number;
}

export interface CloudWord {
  term: string;
  df: number;
  x: number;
  y: number;
  size: number;
  /** 0..1 relative weight, for colour. */
  weight: number;
}

export interface Cloud {
  words: CloudWord[];
  width: number;
  height: number;
  dropped: number;
}

export class TermIndex {
  private docs = new Map<string, Set<string>>();
  private docFreq = new Map<string, number>();

  constructor(entries: SearchEntry[]) {
    const raw = new Map<string, Set<string>>();
    const df = new Map<string, number>();
    for (const e of entries) {
      const terms = new Set<string>();
      for (const m of e.text.toLowerCase().matchAll(TOKEN_RE)) {
        const t = m[0];
        if (t.length >= 3 && !STOPWORDS.has(t)) {
          terms.add(t);
        }
      }
      raw.set(e.slug, terms);
      terms.forEach((t) => df.set(t, (df.get(t) ?? 0) + 1));
    }

    // Fold simple plurals into the singular when the singular is also used
    // ("molluscs" -> "mollusc"), so one idea is not split across two words.
    const fold = (t: string): string => {
      for (const suffix of ['es', 's']) {
        if (t.endsWith(suffix) && t.length > suffix.length + 3) {
          const stem = t.slice(0, -suffix.length);
          if (df.has(stem) && (df.get(stem) ?? 0) >= (df.get(t) ?? 0)) {
            return stem;
          }
        }
      }
      return t;
    };
    for (const [slug, terms] of raw) {
      const folded = new Set([...terms].map(fold));
      this.docs.set(slug, folded);
      folded.forEach((t) => this.docFreq.set(t, (this.docFreq.get(t) ?? 0) + 1));
    }
  }

  get size(): number {
    return this.docs.size;
  }

  /**
   * Top distinctive terms for a set of article slugs. By default "rare" means
   * rare across the whole archive; pass `universe` (e.g. all Cartographics
   * articles) to measure against a narrower set so shared boilerplate drops out.
   */
  distinctive(slugs: string[], limit = 60, universe?: string[]): TermScore[] {
    const group = slugs.filter((s) => this.docs.has(s));
    const n = group.length;
    if (n === 0) {
      return [];
    }
    let uniSize = this.size;
    let uniDf = this.docFreq;
    if (universe) {
      const ids = universe.filter((s) => this.docs.has(s));
      uniSize = ids.length;
      uniDf = new Map();
      for (const s of ids) {
        this.docs.get(s)!.forEach((t) => uniDf.set(t, (uniDf.get(t) ?? 0) + 1));
      }
    }
    const groupDf = new Map<string, number>();
    for (const s of group) {
      this.docs.get(s)!.forEach((t) => groupDf.set(t, (groupDf.get(t) ?? 0) + 1));
    }
    const minDf = Math.max(2, Math.ceil(n * 0.04));
    const out: TermScore[] = [];
    for (const [term, df] of groupDf) {
      if (df < minDf) {
        continue;
      }
      const idf = Math.log(uniSize / (uniDf.get(term) ?? 1));
      out.push({ term, df, score: (df / n) * idf });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Terms found in at least `minShare` of the group's articles (shared boilerplate). */
  common(slugs: string[], minShare: number, limit = 12): TermScore[] {
    const group = slugs.filter((s) => this.docs.has(s));
    const counts = new Map<string, number>();
    for (const s of group) {
      this.docs.get(s)!.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
    }
    return [...counts.entries()]
      .filter(([, df]) => df / group.length >= minShare)
      .map(([term, df]) => ({ term, df, score: df / group.length }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

/**
 * Archimedean-spiral word cloud with rectangle collision. Size is the score
 * (square-root scaled so the top word does not swamp the rest). Words are
 * horizontal only, for legibility; words that cannot be placed are dropped
 * and counted, not shrunk past readability.
 */
export function layoutCloud(terms: TermScore[], width = 900, height = 440): Cloud {
  const MIN = 11;
  const MAX = 38;
  const maxScore = terms.length ? terms[0].score : 1;
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const words: CloudWord[] = [];
  let dropped = 0;

  for (const t of terms) {
    const weight = Math.sqrt(t.score / maxScore);
    const size = MIN + (MAX - MIN) * weight;
    const w = t.term.length * size * 0.56 + 6;
    const h = size * 1.1 + 2;
    let spot: { x: number; y: number } | null = null;

    for (let step = 0; step < 2400 && !spot; step++) {
      const angle = step * 0.35;
      const radius = 2.2 * angle;
      // Stretch horizontally so the cloud fills a wide box.
      const cx = width / 2 + radius * Math.cos(angle) * 1.9;
      const cy = height / 2 + radius * Math.sin(angle);
      const box = { x: cx - w / 2, y: cy - h / 2, w, h };
      const inside = box.x >= 0 && box.y >= 0 && box.x + box.w <= width && box.y + box.h <= height;
      if (inside && !placed.some((p) => box.x < p.x + p.w && box.x + box.w > p.x && box.y < p.y + p.h && box.y + box.h > p.y)) {
        placed.push(box);
        spot = { x: cx, y: cy };
      }
    }

    if (spot) {
      words.push({ term: t.term, df: t.df, x: spot.x, y: spot.y, size, weight });
    } else {
      dropped++;
    }
  }
  return { words, width, height, dropped };
}
