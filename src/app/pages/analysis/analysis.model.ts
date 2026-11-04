import { ArticleSummary, NavCategory, SearchEntry } from '../../services/content.service';

/** Everything on the /analysis page is derived from the content JSON at runtime. */

export type GroupKey = 'codex' | 'news' | 'lab' | 'other';

export const SECTION_LABELS: Record<string, string> = {
  codex: 'Codex',
  news: 'News',
  media: 'Media',
  lab69xia: 'Lab 69 XIA',
  'faction-bgs': 'Faction BGS',
  resources: 'Resources',
  event: 'Events',
  pages: 'Pages',
  uncategorised: 'Uncategorised',
};

export const STUB_CHARS = 300;
export const LONG_CHARS = 5000;

export interface TopicStat {
  slug: string;
  name: string;
  count: number;
  /** Section most of this topic's articles live under. */
  homeSection: string;
  homeShare: number;
  group: GroupKey;
}

export interface SectionStat {
  slug: string;
  label: string;
  count: number;
  medianChars: number;
  stubPct: number;
  longPct: number;
}

export interface Heatmap {
  sections: SectionStat[];
  columns: { slug: string; name: string }[];
  cells: number[][];
  max: number;
}

export interface Finding {
  title: string;
  detail: string;
}

export interface TypeBucket {
  label: string;
  hint: string;
  articles: ArticleSummary[];
}

export interface CloudGroup {
  key: string;
  label: string;
  kind: 'all' | 'topic' | 'type';
  slugs: string[];
  /** Measure distinctiveness against this set instead of the whole archive. */
  universe?: string[];
}

export interface Analysis {
  total: number;
  topicCount: number;
  sectionCount: number;
  topics: TopicStat[];
  topTopic: TopicStat;
  topTopicShare: number;
  noTopic: ArticleSummary[];
  stubs: number;
  heatmap: Heatmap;
  duplicates: Finding[];
  subtopics: Finding[];
  crossSection: Finding[];
  /** The largest category, broken down by its sub-categories. */
  topCategory: { name: string; total: number; buckets: TypeBucket[] };
  cloudGroups: CloudGroup[];
}

/**
 * Title-keyword rules, first match wins. Used only by the workbench's "type" grouping;
 * the analysis itself uses the real navigation categories.
 */
const TYPE_RULES: { label: string; hint: string; re: RegExp }[] = [
  { label: 'Ship-class profiles', hint: '"…-class" / "… Class" vessels', re: /-class\b|\bclass\b/i },
  { label: 'Alien flora & fauna', hint: 'molluscs, pods, trees (really biology)', re: /mollusc|\btrees\b|\bpods?\b|biology/i },
  { label: 'Crash sites & wrecks', hint: 'crashed ships, wreckage, abandoned SRVs', re: /crash|wreck|ghost ship|derelict|abandoned srv|debris|\bsrv\b/i },
  { label: 'Beacons, signals & comms', hint: 'beacons, arrays, transmitters, broadcasts', re: /beacon|signal|comms|communication|broadcast|sensor|transmitter|array|listening|radio|distress/i },
  { label: 'Megaships & fleets', hint: 'generation ships, transports, fleets', re: /megaship|generation ship|trading vessel|transport|fleet|vessel|cargo|tanker|hauler/i },
  { label: 'Numbered & lettered sites', hint: '"Alpha Site", "Site 94"', re: /\bsite\b/i },
  {
    label: 'Stations, bases & settlements',
    hint: 'bars, docks, depots, outposts, camps',
    re: /installation|outpost|settlement|facility|station|harbou?r|landing|dock|terminal|depot|\bbar\b|hub|camp|centre|center|rest\b|gateway|retreat|corner|works|enterprise|yards|cove|keep|base\b|point\b|fort\b|overlook|gap\b|nest|stack|reserve|colony|plant\b|\blab\b/i,
  },
  { label: 'Expeditions, events & campaigns', hint: 'tours, hunts, workshops, challenges', re: /expedition|tour\b|event|trail|hunt|trial|special|christmas|farewell|workshop|challenge|operation|registration|series|unsolved/i },
  { label: 'Guides & references', hint: 'how-tos, lists, surveys', re: /guide|tips|introduction|how to|compendium|list|index|converting|study|survey|summary|price/i },
];

/** Content type from the title rules, or null when none match. */
export function classifyType(title: string): string | null {
  return TYPE_RULES.find((r) => r.re.test(title))?.label ?? null;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : (n / d) * 100;
}

function groupOf(section: string): GroupKey {
  if (section === 'codex') {
    return 'codex';
  }
  if (section === 'news' || section === 'media') {
    return 'news';
  }
  if (section === 'lab69xia') {
    return 'lab';
  }
  return 'other';
}

/** `manifest` must already carry the navigation categories as its topics (see withNavigationTopics). */
export function computeAnalysis(manifest: ArticleSummary[], search: SearchEntry[], navigation: NavCategory[]): Analysis {
  const total = manifest.length;
  const section = (a: ArticleSummary) => a.section || 'uncategorised';
  const length = new Map(search.map((e) => [e.slug, e.text.length]));

  // --- topics ---------------------------------------------------------
  const topicNames = new Map<string, string>();
  const topicArticles = new Map<string, ArticleSummary[]>();
  const noTopic: ArticleSummary[] = [];
  for (const a of manifest) {
    if (a.categories.length === 0) {
      noTopic.push(a);
    }
    for (const c of a.categories) {
      topicNames.set(c.slug, c.name);
      (topicArticles.get(c.slug) ?? topicArticles.set(c.slug, []).get(c.slug)!).push(a);
    }
  }

  const topics: TopicStat[] = [...topicArticles.entries()]
    .map(([slug, arts]) => {
      const counts = new Map<string, number>();
      arts.forEach((a) => counts.set(section(a), (counts.get(section(a)) ?? 0) + 1));
      const [homeSection, homeCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        slug,
        name: topicNames.get(slug)!,
        count: arts.length,
        homeSection,
        homeShare: pct(homeCount, arts.length),
        group: groupOf(homeSection),
      };
    })
    .sort((a, b) => b.count - a.count);

  // Two different topics can share a display name ("News" is both a real topic
  // and one of the five duplicate event topics); show the slug to tell them apart.
  const nameUses = new Map<string, number>();
  topics.forEach((t) => nameUses.set(t.name, (nameUses.get(t.name) ?? 0) + 1));
  topics.forEach((t) => {
    if ((nameUses.get(t.name) ?? 0) > 1) {
      t.name = `${t.name} (${t.slug})`;
    }
  });

  // --- sections + heatmap ---------------------------------------------
  const sectionSlugs = [...new Set(manifest.map(section))];
  const sections: SectionStat[] = sectionSlugs
    .map((slug) => {
      const arts = manifest.filter((a) => section(a) === slug);
      const lens = arts.map((a) => length.get(a.slug) ?? 0);
      return {
        slug,
        label: SECTION_LABELS[slug] ?? slug,
        count: arts.length,
        medianChars: median(lens),
        stubPct: pct(lens.filter((l) => l < STUB_CHARS).length, arts.length),
        longPct: pct(lens.filter((l) => l > LONG_CHARS).length, arts.length),
      };
    })
    .sort((a, b) => b.count - a.count);

  const columns = [...topics.map((t) => ({ slug: t.slug, name: t.name })), { slug: '', name: '(no topic)' }];
  const cells = sections.map((s) =>
    columns.map((c) => {
      const arts = manifest.filter((a) => section(a) === s.slug);
      return c.slug === ''
        ? arts.filter((a) => a.categories.length === 0).length
        : arts.filter((a) => a.categories.some((x) => x.slug === c.slug)).length;
    }),
  );
  const heatmap: Heatmap = { sections, columns, cells, max: Math.max(...cells.flat()) };

  // --- overlap findings -----------------------------------------------
  const sets = new Map([...topicArticles.entries()].map(([slug, arts]) => [slug, new Set(arts.map((a) => a.slug))]));
  const nameOf = (slug: string) => topicNames.get(slug)!;
  const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

  // identical topics collapse into one group
  const groups: string[][] = [];
  for (const t of topics) {
    const g = groups.find((grp) => sameSet(sets.get(grp[0])!, sets.get(t.slug)!));
    g ? g.push(t.slug) : groups.push([t.slug]);
  }
  const duplicates: Finding[] = groups
    .filter((g) => g.length > 1)
    .map((g) => ({
      title: `${g.length} topics tag the same ${sets.get(g[0])!.size} articles`,
      detail: g.map((slug) => `${nameOf(slug)} (${slug})`).join(', '),
    }));

  const reps = groups.map((g) => g[0]);
  const subtopics: Finding[] = [];
  for (const a of reps) {
    for (const b of reps) {
      const A = sets.get(a)!;
      const B = sets.get(b)!;
      if (a === b || A.size >= B.size) {
        continue;
      }
      const inside = [...A].filter((x) => B.has(x)).length;
      if (inside / A.size >= 0.9) {
        const grp = groups.find((g) => g[0] === a)!;
        const label = grp.length > 1 ? `The ${grp.length} identical topics above` : nameOf(a);
        subtopics.push({
          title: `${label} (${A.size}) sits inside ${nameOf(b)} (${B.size})`,
          detail: `${inside} of ${A.size} articles are also tagged ${nameOf(b)}`,
        });
      }
    }
  }

  const crossSection: Finding[] = topics
    .filter((t) => t.count >= 10 && t.homeShare <= 80)
    .map((t) => {
      const counts = new Map<string, number>();
      topicArticles.get(t.slug)!.forEach((a) => counts.set(section(a), (counts.get(section(a)) ?? 0) + 1));
      const parts = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([s, n]) => `${n} in ${SECTION_LABELS[s] ?? s}`);
      return { title: `${t.name} (${t.count}) spans ${counts.size} sections`, detail: parts.join(' · ') };
    });

  // --- the largest category, by its real sub-categories ----------------
  const topNav = navigation.find((c) => c.slug === topics[0].slug);
  const bySlug = new Map(manifest.map((a) => [a.slug, a]));
  const buckets: TypeBucket[] = (topNav?.subs ?? [])
    .map((sub) => ({
      label: sub.name,
      hint: '',
      articles: sub.articles.map((slug) => bySlug.get(slug)).filter((a): a is ArticleSummary => !!a),
    }))
    .sort((a, b) => b.articles.length - a.articles.length);
  const topSlugs = topicArticles.get(topics[0].slug)!.map((a) => a.slug);
  const cloudGroups: CloudGroup[] = [
    { key: 'all', label: 'Whole archive', kind: 'all', slugs: manifest.map((a) => a.slug) },
    ...topics
      .filter((t) => t.count >= 10)
      .map((t): CloudGroup => ({ key: `topic:${t.slug}`, label: `${t.name} (${t.count})`, kind: 'topic', slugs: topicArticles.get(t.slug)!.map((a) => a.slug) })),
    ...buckets
      .filter((b) => b.articles.length >= 5)
      .map((b): CloudGroup => ({ key: `type:${b.label}`, label: `${b.label} (${b.articles.length})`, kind: 'type', slugs: b.articles.map((a) => a.slug), universe: topSlugs })),
  ];

  const topTopic = topics[0];
  return {
    total,
    topicCount: topics.length,
    sectionCount: sections.length,
    topics,
    topTopic,
    topTopicShare: pct(topTopic.count, total),
    noTopic,
    stubs: [...length.values()].filter((l) => l < STUB_CHARS).length,
    heatmap,
    duplicates,
    subtopics,
    crossSection,
    topCategory: { name: topics[0].name, total: topSlugs.length, buckets },
    cloudGroups,
  };
}

// --- squarified treemap ---------------------------------------------------

export interface TreemapRect<T> {
  item: T;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Lays items out in a W x H box with area proportional to value. */
export function treemap<T>(items: { item: T; value: number }[], W: number, H: number): TreemapRect<T>[] {
  const total = items.reduce((s, i) => s + i.value, 0);
  const nodes = [...items].sort((a, b) => b.value - a.value).map((i) => ({ item: i.item, area: (i.value / total) * W * H }));
  const out: TreemapRect<T>[] = [];
  let x = 0;
  let y = 0;
  let w = W;
  let h = H;
  let row: typeof nodes = [];

  const worst = (r: typeof nodes, side: number) => {
    const s = r.reduce((a, n) => a + n.area, 0);
    const mx = Math.max(...r.map((n) => n.area));
    const mn = Math.min(...r.map((n) => n.area));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const flush = (r: typeof nodes) => {
    const s = r.reduce((a, n) => a + n.area, 0);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      for (const n of r) {
        const nh = n.area / cw;
        out.push({ item: n.item, x, y: cy, w: cw, h: nh });
        cy += nh;
      }
      x += cw;
      w -= cw;
    } else {
      const rh = s / w;
      let cx = x;
      for (const n of r) {
        const nw = n.area / rh;
        out.push({ item: n.item, x: cx, y, w: nw, h: rh });
        cx += nw;
      }
      y += rh;
      h -= rh;
    }
  };

  for (const n of nodes) {
    const side = Math.min(w, h);
    if (row.length === 0 || worst([...row, n], side) <= worst(row, side)) {
      row.push(n);
    } else {
      flush(row);
      row = [n];
    }
  }
  if (row.length) {
    flush(row);
  }
  return out;
}
