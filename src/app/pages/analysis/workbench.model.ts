import { ArticleSummary } from '../../services/content.service';

/** Pure logic behind the category workbench on /analysis. */

export interface Group {
  name: string;
  slugs: string[];
}

export interface Metrics {
  groups: number;
  largest: { name: string; share: number } | null;
  unassigned: number;
  multi: number;
  small: number;
  /** How many equal-sized groups the split behaves like (exp of entropy). */
  effective: number;
}

export interface Result {
  groups: Group[];
  unassigned: string[];
  metrics: Metrics;
  /** Article slug -> the group names it landed in. */
  assign: Map<string, string[]>;
}

export const SMALL_GROUP = 5;

/**
 * Runs an assignment function over every article. With `once`, an article that
 * lands in several groups is kept only in the first.
 */
export function evaluate(manifest: ArticleSummary[], assignFn: (a: ArticleSummary) => string[], once: boolean): Result {
  const groups = new Map<string, string[]>();
  const assign = new Map<string, string[]>();
  const unassigned: string[] = [];

  for (const a of manifest) {
    let names = [...new Set(assignFn(a))];
    if (once) {
      names = names.slice(0, 1);
    }
    assign.set(a.slug, names);
    if (names.length === 0) {
      unassigned.push(a.slug);
    }
    for (const n of names) {
      (groups.get(n) ?? groups.set(n, []).get(n)!).push(a.slug);
    }
  }

  const list: Group[] = [...groups.entries()]
    .map(([name, slugs]) => ({ name, slugs }))
    .sort((a, b) => b.slugs.length - a.slugs.length || a.name.localeCompare(b.name));

  const placements = list.reduce((s, g) => s + g.slugs.length, 0);
  const entropy = list.reduce((s, g) => {
    const p = g.slugs.length / placements;
    return s - p * Math.log(p);
  }, 0);

  return {
    groups: list,
    unassigned,
    assign,
    metrics: {
      groups: list.length,
      largest: list.length ? { name: list[0].name, share: (list[0].slugs.length / manifest.length) * 100 } : null,
      unassigned: unassigned.length,
      multi: [...assign.values()].filter((n) => n.length > 1).length,
      small: list.filter((g) => g.slugs.length < SMALL_GROUP).length,
      effective: placements ? Math.exp(entropy) : 0,
    },
  };
}

/** Groups that most often share articles with `name` under this assignment. */
export function alsoIn(result: Result, name: string, limit = 6): { name: string; count: number }[] {
  const group = result.groups.find((g) => g.name === name);
  if (!group) {
    return [];
  }
  const counts = new Map<string, number>();
  for (const slug of group.slugs) {
    for (const other of result.assign.get(slug) ?? []) {
      if (other !== name) {
        counts.set(other, (counts.get(other) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .map(([n, count]) => ({ name: n, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// --- regions ----------------------------------------------------------------

const PROC_RE = /\b(?:[A-Z][a-z]+(?: [A-Z][a-z]+)?|Col \d+ Sector|Sector) [A-Z]{2}-[A-Z] [a-h]\d+(?:-\d+)?\b/g;
const COL_RE = /\bCol \d+(?: Sector)?\b/g;
const PROC_SUFFIX = /\s[A-Z]{2}-[A-Z] [a-h]\d+(?:-\d+)?$/;

/** Sector names written in the text, e.g. "Pleiades Sector", "Col 285 Sector". */
export function regionsOf(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(PROC_RE)) {
    out.add(m[0].replace(PROC_SUFFIX, ''));
  }
  for (const m of text.matchAll(COL_RE)) {
    out.add(m[0].endsWith('Sector') ? m[0] : `${m[0]} Sector`);
  }
  out.delete('Sector');
  return [...out];
}

// --- keyword rules ----------------------------------------------------------

export interface KeywordRule {
  name: string;
  keywords: string;
  /** `topic` matches the article's topic names/slugs and `section:<name>` tokens. */
  scope: 'title' | 'body' | 'both' | 'topic';
  /** Body matches need at least this many mentions (default 1). */
  min?: number;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Words match at the start of a word, so "mollusc" also finds "molluscs". */
export function compileRule(rule: KeywordRule): ((title: string, body: string, topics: string) => boolean) | null {
  const words = rule.keywords.split(',').map((w) => w.trim()).filter(Boolean);
  if (words.length === 0 || !rule.name.trim()) {
    return null;
  }
  const pattern = `(?:^|[^a-z0-9])(?:${words.map(escapeRe).join('|')})`;
  const re = new RegExp(pattern, 'i');
  const reAll = new RegExp(pattern, 'gi');
  const min = Math.max(1, Math.floor(rule.min ?? 1));
  const inBody = (body: string) => (min <= 1 ? re.test(body) : (body.match(reAll)?.length ?? 0) >= min);
  return (title, body, topics) => {
    if (rule.scope === 'topic') {
      return re.test(topics);
    }
    return (rule.scope !== 'body' && re.test(title)) || (rule.scope !== 'title' && inBody(body));
  };
}

// --- topic merges -----------------------------------------------------------

/** The merges suggested by the analysis above: topic slug -> merged group. */
export const PROPOSED_MERGES: Record<string, string> = {
  news: 'News & media',
  media: 'News & media',
  'surface-biology': 'Surface biology & taxonomy',
  taxonomy: 'Surface biology & taxonomy',
  lab69xia: 'Lab 69 XIA',
  general: 'Lab 69 XIA',
  builds: 'Lab 69 XIA',
  'public-events': 'Events',
  public: 'Events',
  'events-public': 'Events',
  'news-public': 'Events',
  'random-stuff': 'Events',
  arts: 'Events',
};

/** Topic names and slugs plus a `section:<name>` token, for topic-scoped rules. */
export function topicString(a: { section: string | null; categories: { name: string; slug: string }[] }): string {
  return [`section:${a.section ?? 'uncategorised'}`, ...a.categories.flatMap((c) => [c.name, c.slug])].join(' | ');
}

/** First matching rule's name for an article (order matters), or null. */
export function makeSuggester(rules: KeywordRule[]): (title: string, body: string, topics: string) => string | null {
  const compiled = rules.map(compileRule);
  return (title, body, topics) => {
    const i = compiled.findIndex((c) => c?.(title, body, topics));
    return i === -1 ? null : rules[i].name.trim();
  };
}

/**
 * Suggested Canonn labs. Order matters (use "count each article once").
 * Research & Development means software and tools for commanders, so tool pages
 * are picked out first; community content is set aside next; then the domain
 * labs by title, by body text, and finally by existing topic.
 */
export const LAB_RULES: KeywordRule[] = [
  { name: 'Research & Development', keywords: 'r&d, tool, calculator, interactive, frontend, edsm, inara, galnet archive, quick reference, converting, logging', scope: 'title' },
  { name: 'Community & news', keywords: 'section:news, section:media, section:event, section:pages, section:faction-bgs, section:resources', scope: 'topic' },
  { name: 'Community & news', keywords: 'eagle eye, galnet digest', scope: 'title' },
  { name: 'Crypto', keywords: 'cipher, crypt, decode, decrypt, encrypt, puzzle, morse, binary, hash, phonetic, anagram, enigma, riddle, secret, unsolved', scope: 'title' },
  { name: 'Guardian', keywords: 'guardian, obelisk, ruin, relic, ram tah, totem, stele', scope: 'title' },
  { name: 'Thargoid', keywords: 'thargoid, barnacle, maelstrom, interceptor, thargon, titan, hydra, medusa, basilisk, cyclops, scythe, glaive, revenant, caustic, hyperdict', scope: 'title' },
  { name: 'Signals', keywords: 'signal, beacon, comms, communication, broadcast, transmi, radio, listening, frequency, distress, sensor, array', scope: 'title' },
  { name: 'Biology/Geology', keywords: 'mollusc, tree, pod, biolog, genom, bacteri, fungo, aleoida, cactoida, tussock, stratum, osseus, recepta, concha, frutexa, clypeus, tubers, organic, lifeform, flora, fauna, geolog, geyser, volcan, crystal, magma, mineral, lava, fumarole, taxonom, atmospher', scope: 'title' },
  { name: 'Equipment', keywords: 'class, module, engineer, weapon, cannon, ammunition, slf, damage, limpet, fsd, thruster, hardpoint, srv, build, loadout, hull, shield, scanner', scope: 'title' },
  { name: 'Lore', keywords: 'lore, history, story, stories, legend, myth, memorial, farewell, tribute, tale, chronicle, diary, treasure, mystery, dedicant, saga, azimuth, nemesis, aegis, prophet, sanctum, church', scope: 'title' },
  { name: 'Exploration', keywords: 'expedition, exploration, explorer, neutron, route, jump, cartograph, nebula, waypoint, pathfinder, tour, outpost, settlement, installation, station, megaship, generation ship, vessel, fleet, colony, landing, harbour, dock, depot, terminal, camp, base, fort, site, rest', scope: 'title' },
  { name: 'Thargoid', keywords: 'thargoid, barnacle, maelstrom, interceptor, thargon, hyperdict', scope: 'body', min: 5 },
  { name: 'Guardian', keywords: 'guardian, obelisk, ram tah', scope: 'body', min: 5 },
  { name: 'Biology/Geology', keywords: 'mollusc, bacteri, fungo, aleoida, cactoida, tussock, stratum, osseus, recepta, concha, frutexa, clypeus, geyser, volcan, lifeform, fumarole', scope: 'body', min: 5 },
  { name: 'Research & Development', keywords: 'canonn r&d, edmc, plugin', scope: 'body', min: 2 },
  { name: 'Lore', keywords: 'archaeology, galnet, legend, chronicle', scope: 'topic' },
  { name: 'Thargoid', keywords: 'xenotechnology', scope: 'topic' },
  { name: 'Biology/Geology', keywords: 'geology, surface-biology, taxonomy', scope: 'topic' },
  { name: 'Exploration', keywords: 'cartographics', scope: 'topic' },
];

export const DEFAULT_RULES: KeywordRule[] = [
  { name: 'Crash sites', keywords: 'crash, wreck, derelict', scope: 'title' },
  { name: 'Beacons & signals', keywords: 'beacon, signal, comms', scope: 'title' },
  { name: 'Thargoid', keywords: 'thargoid, barnacle, maelstrom', scope: 'body' },
];
