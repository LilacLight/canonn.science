import { ArticleSummary } from '../../services/content.service';

/**
 * Pure logic behind the article sorter: ordering, filtering and edits to a
 * two-level category tree (category -> sub-category). An article can be in
 * several categories, each with at most one sub-category.
 */

export type Filter = 'unsorted' | 'skipped' | 'sorted' | 'all';

export interface Category {
  name: string;
  subs: string[];
}

export interface Assignment {
  category: string;
  /** Sub-categories within the category; an article can have several. */
  subs?: string[];
}

/** A single "Category" or "Category > Sub" label. */
export interface Label {
  category: string;
  sub?: string;
}

export interface SorterState {
  categories: Category[];
  /** Article slug -> its assignments. */
  assign: Record<string, Assignment[]>;
  skipped: string[];
}

export function emptyState(): SorterState {
  return { categories: [], assign: {}, skipped: [] };
}

const clean = (raw: string): string => raw.trim().replace(/\s+/g, ' ');
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

// --- ordering and navigation ---------------------------------------------------

function time(a: ArticleSummary): number {
  const t = a.date ? Date.parse(a.date) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

/** Newest first; undated articles last, in a stable order. */
export function recentFirst(manifest: ArticleSummary[]): ArticleSummary[] {
  return manifest
    .map((a, i) => ({ a, i, t: time(a) }))
    .sort((x, y) => (y.t === x.t ? x.i - y.i : y.t > x.t ? 1 : -1))
    .map((x) => x.a);
}

export function isSorted(state: SorterState, slug: string): boolean {
  return (state.assign[slug]?.length ?? 0) > 0;
}

export function matches(filter: Filter, state: SorterState, slug: string): boolean {
  const sorted = isSorted(state, slug);
  switch (filter) {
    case 'all':
      return true;
    case 'sorted':
      return sorted;
    case 'skipped':
      return !sorted && state.skipped.includes(slug);
    case 'unsorted':
      return !sorted && !state.skipped.includes(slug);
  }
}

/** Index of the next article in `dir` that satisfies `pred`, or `from` if none does. */
export function step(ordered: ArticleSummary[], from: number, dir: 1 | -1, pred: (slug: string) => boolean): number {
  for (let j = from + dir; j >= 0 && j < ordered.length; j += dir) {
    if (pred(ordered[j].slug)) {
      return j;
    }
  }
  return from;
}

/** First index that satisfies `pred`, or 0 when nothing does. */
export function firstMatch(ordered: ArticleSummary[], pred: (slug: string) => boolean): number {
  const i = ordered.findIndex((a) => pred(a.slug));
  return i === -1 ? 0 : i;
}

// --- creating categories ---------------------------------------------------------

export function findCategory(state: SorterState, name: string): Category | undefined {
  return state.categories.find((c) => same(c.name, name));
}

/** Canonical name of the category, creating it if new. Empty input returns ''. */
export function addCategory(state: SorterState, raw: string): string {
  const name = clean(raw);
  if (!name) {
    return '';
  }
  const existing = findCategory(state, name);
  if (existing) {
    return existing.name;
  }
  state.categories.push({ name, subs: [] });
  return name;
}

/** Canonical sub-category name, creating it under an existing category. '' if not possible. */
export function addSub(state: SorterState, category: string, raw: string): string {
  const name = clean(raw);
  const cat = findCategory(state, category);
  if (!name || !cat) {
    return '';
  }
  const existing = cat.subs.find((s) => same(s, name));
  if (existing) {
    return existing;
  }
  cat.subs.push(name);
  return name;
}

/** Reads "Category" or "Category > Sub", creating whatever is new. */
export function addLabel(state: SorterState, raw: string): Label | null {
  const [first, ...rest] = raw.split('>');
  const category = addCategory(state, first);
  if (!category) {
    return null;
  }
  const sub = rest.length ? addSub(state, category, rest.join('>')) : '';
  return sub ? { category, sub } : { category };
}

// --- assigning --------------------------------------------------------------------

function put(state: SorterState, slug: string, list: Assignment[]): void {
  if (list.length) {
    state.assign[slug] = list;
    state.skipped = state.skipped.filter((s) => s !== slug);
  } else {
    delete state.assign[slug];
  }
}

export function assignmentFor(state: SorterState, slug: string, category: string): Assignment | undefined {
  return state.assign[slug]?.find((a) => a.category === category);
}

/** Adds the category to the article, or removes it (and its sub-category) if present. */
export function toggleCategory(state: SorterState, slug: string, category: string): boolean {
  const list = state.assign[slug] ?? [];
  if (list.some((a) => a.category === category)) {
    put(state, slug, list.filter((a) => a.category !== category));
    return false;
  }
  put(state, slug, [...list, { category }]);
  return true;
}

/**
 * Sets the article's sub-category within a category (adding the category if
 * needed). Choosing the sub-category it already has clears it, keeping the category.
 */
export function toggleSub(state: SorterState, slug: string, category: string, sub: string): boolean {
  // Keep the category tree and the assignments in step.
  category = addCategory(state, category);
  sub = addSub(state, category, sub);
  if (!category || !sub) {
    return false;
  }
  const list = state.assign[slug] ?? [];
  const current = list.find((a) => a.category === category);
  if (!current) {
    put(state, slug, [...list, { category, subs: [sub] }]);
    return true;
  }
  const subs = current.subs ?? [];
  const clearing = subs.includes(sub);
  const next = clearing ? subs.filter((x) => x !== sub) : [...subs, sub];
  put(state, slug, list.map((a) => (a.category === category ? withSubs(category, next) : a)));
  return !clearing;
}

function withSubs(category: string, subs: string[]): Assignment {
  return subs.length ? { category, subs } : { category };
}

/** Applies a "Category" or "Category > Sub" label to the article (never removes). */
export function applyLabel(state: SorterState, slug: string, raw: string): Label | null {
  const label = addLabel(state, raw);
  if (!label) {
    return null;
  }
  const list = state.assign[slug] ?? [];
  const current = list.find((a) => a.category === label.category);
  if (!current) {
    put(state, slug, [...list, withSubs(label.category, label.sub ? [label.sub] : [])]);
  } else if (label.sub && !current.subs?.includes(label.sub)) {
    put(state, slug, list.map((a) => (a.category === label.category ? withSubs(label.category, [...(current.subs ?? []), label.sub!]) : a)));
  }
  return label;
}

export function skip(state: SorterState, slug: string): void {
  if (!isSorted(state, slug) && !state.skipped.includes(slug)) {
    state.skipped.push(slug);
  }
}

// --- renaming and deleting --------------------------------------------------------

/** Keeps one assignment per category, combining their sub-categories. */
function tidy(list: Assignment[]): Assignment[] {
  const out = new Map<string, string[]>();
  for (const a of list) {
    const subs = out.get(a.category) ?? [];
    (a.subs ?? []).forEach((x) => subs.includes(x) || subs.push(x));
    out.set(a.category, subs);
  }
  return [...out].map(([category, subs]) => withSubs(category, subs));
}

/** Renaming onto an existing category merges the two, including their sub-categories. */
export function renameCategory(state: SorterState, from: string, to: string): string {
  const target = clean(to);
  const cat = findCategory(state, from);
  if (!target || !cat || target === from) {
    return from;
  }
  const clash = state.categories.find((c) => same(c.name, target) && c !== cat);
  if (clash) {
    cat.subs.forEach((s) => addSub(state, clash.name, s));
    state.categories = state.categories.filter((c) => c !== cat);
  } else {
    cat.name = target;
  }
  const name = clash ? clash.name : target;
  for (const slug of Object.keys(state.assign)) {
    state.assign[slug] = tidy(state.assign[slug].map((a) => (a.category === from ? { ...a, category: name } : a)));
  }
  return name;
}

/** Renaming onto an existing sub-category merges the two. */
export function renameSub(state: SorterState, category: string, from: string, to: string): string {
  const target = clean(to);
  const cat = findCategory(state, category);
  if (!target || !cat || target === from || !cat.subs.includes(from)) {
    return from;
  }
  const clash = cat.subs.find((s) => same(s, target) && s !== from);
  const name = clash ?? target;
  cat.subs = clash ? cat.subs.filter((s) => s !== from) : cat.subs.map((s) => (s === from ? target : s));
  for (const slug of Object.keys(state.assign)) {
    state.assign[slug] = tidy(
      state.assign[slug].map((a) => (a.category === cat.name && a.subs?.includes(from) ? withSubs(a.category, a.subs.map((x) => (x === from ? name : x))) : a)),
    );
  }
  return name;
}

/**
 * Moves a sub-category, with its articles, to another category. If the target
 * already has a sub-category of that name the two merge. Returns the new name,
 * or '' if nothing moved.
 */
export function moveSub(state: SorterState, from: string, sub: string, to: string): string {
  const src = findCategory(state, from);
  const dest = findCategory(state, to);
  if (!src || !dest || src === dest || !src.subs.includes(sub)) {
    return '';
  }
  const name = addSub(state, dest.name, sub);
  src.subs = src.subs.filter((s) => s !== sub);
  for (const slug of Object.keys(state.assign)) {
    state.assign[slug] = tidy(
      state.assign[slug].flatMap((a) =>
        a.category === src.name && a.subs?.includes(sub)
          ? [withSubs(dest.name, [name]), ...(a.subs.length > 1 ? [withSubs(a.category, a.subs.filter((x) => x !== sub))] : [])]
          : [a],
      ),
    );
  }
  return name;
}

export function deleteCategory(state: SorterState, name: string): void {
  state.categories = state.categories.filter((c) => c.name !== name);
  for (const slug of Object.keys(state.assign)) {
    put(state, slug, state.assign[slug].filter((a) => a.category !== name));
  }
}

/** Removes the sub-category; articles keep their category. */
export function deleteSub(state: SorterState, category: string, sub: string): void {
  const cat = findCategory(state, category);
  if (!cat) {
    return;
  }
  cat.subs = cat.subs.filter((s) => s !== sub);
  for (const slug of Object.keys(state.assign)) {
    state.assign[slug] = state.assign[slug].map((a) =>
      a.category === category && a.subs?.includes(sub) ? withSubs(category, a.subs.filter((x) => x !== sub)) : a,
    );
  }
}

// --- counting ---------------------------------------------------------------------

export function membersOf(state: SorterState, category: string, sub?: string): string[] {
  return Object.keys(state.assign).filter((slug) =>
    state.assign[slug].some((a) => a.category === category && (sub === undefined || !!a.subs?.includes(sub))),
  );
}

export function countIn(state: SorterState, category: string, sub?: string): number {
  return membersOf(state, category, sub).length;
}

/** Articles in the category that have no sub-category yet. */
export function withoutSub(state: SorterState, category: string): string[] {
  return Object.keys(state.assign).filter((slug) => state.assign[slug].some((a) => a.category === category && !a.subs?.length));
}

// --- export / import --------------------------------------------------------------

export interface Exported {
  version: 2;
  categories: { name: string; count: number; subs: { name: string; count: number }[] }[];
  assignments: Record<string, Assignment[]>;
  skipped: string[];
}

export function exportState(state: SorterState): Exported {
  return {
    version: 2,
    categories: state.categories.map((c) => ({
      name: c.name,
      count: countIn(state, c.name),
      subs: c.subs.map((s) => ({ name: s, count: countIn(state, c.name, s) })),
    })),
    assignments: state.assign,
    skipped: state.skipped,
  };
}

/**
 * Reads a saved or exported state into a clean one; null when unusable. Also
 * accepts plain strings ("Category" or "Category > Sub") as assignments.
 */
export function parseState(raw: unknown): SorterState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const assignRaw = (o['assignments'] ?? o['assign']) as Record<string, unknown> | undefined;
  if (!assignRaw || typeof assignRaw !== 'object' || Array.isArray(assignRaw)) {
    return null;
  }
  const state = emptyState();

  // One entry can carry several sub-categories ("subs"), or a single one ("sub", older files).
  const labelsOf = (x: unknown): string[] => {
    if (typeof x === 'string') {
      return [x];
    }
    const a = x as { category?: unknown; sub?: unknown; subs?: unknown; name?: unknown } | null;
    const category = typeof a?.category === 'string' ? a.category : typeof a?.name === 'string' ? a.name : '';
    const subs = [a?.sub, ...(Array.isArray(a?.subs) ? (a.subs as unknown[]) : [])].filter(
      (v): v is string => typeof v === 'string' && !!v,
    );
    return subs.length ? subs.map((v) => `${category} > ${v}`) : [category];
  };

  for (const c of Array.isArray(o['categories']) ? (o['categories'] as unknown[]) : []) {
    const name = addCategory(state, typeof c === 'string' ? c : labelsOf({ name: (c as { name?: unknown })?.name })[0]);
    const subs = (c as { subs?: unknown })?.subs;
    if (name && Array.isArray(subs)) {
      subs.forEach((s) => addSub(state, name, typeof s === 'string' ? s : String((s as { name?: unknown })?.name ?? '')));
    }
  }
  for (const [slug, list] of Object.entries(assignRaw)) {
    if (Array.isArray(list)) {
      list.forEach((x) => labelsOf(x).forEach((l) => applyLabel(state, slug, l)));
    }
  }
  if (Array.isArray(o['skipped'])) {
    state.skipped = (o['skipped'] as unknown[]).filter((s): s is string => typeof s === 'string' && !isSorted(state, s));
  }
  return state;
}

/** Union of two states: nothing in either is lost. */
export function mergeStates(base: SorterState, incoming: SorterState): SorterState {
  const out: SorterState = {
    categories: base.categories.map((c) => ({ name: c.name, subs: [...c.subs] })),
    assign: {},
    skipped: [...base.skipped],
  };
  for (const [slug, list] of Object.entries(base.assign)) {
    out.assign[slug] = list.map((a) => ({ ...a }));
  }
  for (const c of incoming.categories) {
    const name = addCategory(out, c.name);
    c.subs.forEach((s) => addSub(out, name, s));
  }
  for (const [slug, list] of Object.entries(incoming.assign)) {
    for (const a of list) {
      if (a.subs?.length) {
        a.subs.forEach((sub) => applyLabel(out, slug, `${a.category} > ${sub}`));
      } else {
        applyLabel(out, slug, a.category);
      }
    }
  }
  incoming.skipped.forEach((s) => {
    if (!out.skipped.includes(s)) {
      out.skipped.push(s);
    }
  });
  out.skipped = out.skipped.filter((s) => !isSorted(out, s));
  return out;
}
