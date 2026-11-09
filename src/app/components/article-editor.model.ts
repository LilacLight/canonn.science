// Pure logic behind the hidden article.json editor (?edit=1): validation, building the JSON,
// working out which changes could break existing links, and composing the GitHub issue.
// Mirrors the rules in tools/lib/content.mjs; the real check still runs in CI.
import type { NavCategory } from '../services/content.service';

export interface MetaPlacement {
  category: string;
  subs: string[];
  pinned?: boolean;
}

/** article.json as stored in the repo. Unknown keys are preserved untouched. */
export interface ArticleMeta {
  title: string;
  slug: string;
  section: string;
  date?: string;
  author?: string;
  excerpt?: string;
  banner?: string;
  categories: MetaPlacement[];
  linked?: string[];
  [key: string]: unknown;
}

export interface Taxonomy {
  otherName: string;
  categories: { name: string; subs: string[] }[];
}

export interface EditorEntry {
  meta: ArticleMeta;
  /** Slugs of articles whose body links to this article. */
  inbound: string[];
  /** Slugs of articles that list this one in `linked`. */
  linkedBy: string[];
}

export interface EditorData {
  taxonomy: Taxonomy;
  articles: Record<string, EditorEntry>;
}

export interface Draft {
  title: string;
  section: string;
  date: string;
  author: string;
  excerpt: string;
  categories: MetaPlacement[];
  linked: string[];
}

export type Severity = 'danger' | 'caution' | 'info';
export interface Warning {
  severity: Severity;
  text: string;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$/;

export function draftFrom(meta: ArticleMeta): Draft {
  return {
    title: meta.title ?? '',
    section: meta.section ?? '',
    date: meta.date ?? '',
    author: meta.author ?? '',
    excerpt: meta.excerpt ?? '',
    categories: (meta.categories ?? []).map((c) => ({ category: c.category, subs: [...c.subs], ...(c.pinned ? { pinned: true } : {}) })),
    linked: [...(meta.linked ?? [])],
  };
}

/** Plain-text field rules shared by author and excerpt. */
function plainTextError(label: string, value: string, max: number): string | null {
  if (value.length > max) return `${label} must be at most ${max} characters.`;
  if (/[<>]/.test(value)) return `${label} must be plain text (no < or >).`;
  return null;
}

export function validate(slug: string, d: Draft, taxonomy: Taxonomy): string[] {
  const errors: string[] = [];
  if (!d.title.trim()) errors.push('Title is required.');
  else if (d.title.length > 200) errors.push('Title must be at most 200 characters.');
  if (!SLUG.test(d.section)) errors.push('Section must be lowercase letters, digits and hyphens.');
  if (!d.date) errors.push('Date is required.');
  else if (!ISO.test(d.date) || Number.isNaN(Date.parse(d.date))) errors.push('Date must be ISO 8601, e.g. 2026-11-04.');
  for (const e of [plainTextError('Author', d.author, 200), plainTextError('Excerpt', d.excerpt, 600)]) if (e) errors.push(e);
  if (d.categories.length === 0) errors.push('At least one category is required.');
  for (const c of d.categories) {
    const known = taxonomy.categories.find((t) => t.name === c.category);
    if (!known) errors.push(`Unknown category "${c.category}".`);
    else for (const s of c.subs) if (!known.subs.includes(s)) errors.push(`Unknown sub-category "${s}" in "${c.category}".`);
  }
  if (d.linked.length > 24) errors.push('At most 24 linked articles.');
  if (d.linked.includes(slug)) errors.push('An article cannot link to itself.');
  return errors;
}

/** The article.json to save: the original with the edited fields applied, key order kept. */
export function buildMeta(original: ArticleMeta, d: Draft): ArticleMeta {
  const out: ArticleMeta = { ...original };
  const set = (key: string, value: unknown, keep: boolean) => {
    // Leave a field exactly as it was unless the edit changed it (e.g. keep an existing "excerpt": "").
    if (!keep && (original[key] ?? '') === '') return;
    if (keep) out[key] = value;
    else delete out[key];
  };
  out.title = d.title.trim();
  out.section = d.section.trim();
  set('date', d.date.trim(), d.date.trim() !== '');
  set('author', d.author.trim(), d.author.trim() !== '');
  set('excerpt', d.excerpt.trim(), d.excerpt.trim() !== '');
  out.categories = d.categories.map((c) => ({ category: c.category, subs: [...c.subs], ...(c.pinned ? { pinned: true } : {}) }));
  set('linked', [...d.linked], d.linked.length > 0);
  return out;
}

export const metaToJson = (meta: ArticleMeta): string => JSON.stringify(meta, null, 2) + '\n';

const articlePath = (section: string, slug: string) => (section === 'pages' ? `/${slug}` : `/${section}/${slug}`);

/**
 * Changes that could break links from other pages or sites. `danger` = an existing URL stops
 * working; `caution` = a page keeps working but its contents change; `info` = worth knowing.
 */
export function impact(
  original: ArticleMeta,
  d: Draft,
  nav: NavCategory[],
  taxonomy: Taxonomy,
  entry: Pick<EditorEntry, 'inbound' | 'linkedBy'>,
): Warning[] {
  const warnings: Warning[] = [];
  const slug = original.slug;
  const list = (slugs: string[]) => (slugs.length > 4 ? `${slugs.slice(0, 4).join(', ')} and ${slugs.length - 4} more` : slugs.join(', '));

  if (d.section.trim() !== original.section) {
    const from = articlePath(original.section, slug);
    const to = articlePath(d.section.trim(), slug);
    let text = `Changing the section moves this article from ${from} to ${to}. Links from other sites, bookmarks and shared Bluesky/Discord posts to the old address may stop working.`;
    if (entry.inbound.length) text += ` ${entry.inbound.length} other article(s) link here by address: ${list(entry.inbound)}.`;
    warnings.push({ severity: 'danger', text });
  }

  // Where an article sits within a category: its sub-categories, or "Everything else" when the
  // category has sub-categories but the article names none.
  const effectiveSubs = (category: string, subs: string[]): string[] => {
    const tax = taxonomy.categories.find((t) => t.name === category);
    return subs.length ? subs : tax && tax.subs.length ? [taxonomy.otherName] : [];
  };
  const now = new Map(d.categories.map((c) => [c.category, c]));
  const before = new Map((original.categories ?? []).map((c) => [c.category, c]));

  for (const [name] of before) {
    const navCat = nav.find((c) => c.name === name);
    const topic = navCat ? `/topics/${navCat.slug}` : `the "${name}" topic page`;
    if (!now.has(name)) {
      if (navCat && navCat.count <= 1) {
        warnings.push({ severity: 'danger', text: `"${name}" contains only this article. Removing it deletes the topic page ${topic} (and its sub-category pages), so any link to them breaks.` });
      } else {
        warnings.push({ severity: 'caution', text: `The article will no longer be listed under "${name}". Links to ${topic} keep working, but this article disappears from that page.` });
      }
      continue;
    }
    const gone = effectiveSubs(name, before.get(name)!.subs).filter((s) => !effectiveSubs(name, now.get(name)!.subs).includes(s));
    for (const sub of gone) {
      const navSub = navCat?.subs.find((s) => s.name === sub);
      const subTopic = navSub && navCat ? `/topics/${navCat.slug}/${navSub.slug}` : `the "${sub}" page`;
      if (navSub && navSub.articles.length <= 1) {
        warnings.push({ severity: 'danger', text: `"${sub}" (in ${name}) contains only this article. Removing it deletes the page ${subTopic}, so any link to it breaks.` });
      } else {
        warnings.push({ severity: 'caution', text: `The article will no longer be listed under "${sub}" in ${name}. Links to ${subTopic} keep working, but this article disappears from that page.` });
      }
    }
    const pinnedBefore = !!before.get(name)!.pinned;
    const pinnedNow = !!now.get(name)!.pinned;
    if (pinnedBefore !== pinnedNow) {
      warnings.push({ severity: 'info', text: `${pinnedNow ? 'Pins' : 'Unpins'} the article ${pinnedNow ? 'to the top of' : 'in'} "${name}", changing the order on that page.` });
    }
  }
  const firstBefore = original.categories?.[0]?.category;
  const firstNow = d.categories[0]?.category;
  if (firstBefore && firstNow && firstBefore !== firstNow) {
    warnings.push({ severity: 'info', text: `"${firstNow}" is now the first category, so it becomes the one shown in this article's breadcrumb.` });
  }
  if (d.date.trim() !== (original.date ?? '')) {
    warnings.push({ severity: 'info', text: 'Changing the date changes where the article sorts in lists.' });
  }
  return warnings;
}

/** One line per change, for the issue body. */
export function describeChanges(original: ArticleMeta, next: ArticleMeta): string[] {
  const lines: string[] = [];
  const text = (key: 'title' | 'section' | 'date' | 'author' | 'excerpt') => {
    const a = (original[key] as string | undefined) ?? '';
    const b = (next[key] as string | undefined) ?? '';
    if (a !== b) lines.push(`- **${key}**: ${a ? `\`${a.length > 80 ? a.slice(0, 77) + '...' : a}\`` : '_none_'} -> ${b ? `\`${b.length > 80 ? b.slice(0, 77) + '...' : b}\`` : '_removed_'}`);
  };
  (['title', 'section', 'date', 'author', 'excerpt'] as const).forEach(text);

  const render = (c: MetaPlacement) => `${c.category}${c.subs.length ? ' > ' + c.subs.join(', ') : ''}${c.pinned ? ' (pinned)' : ''}`;
  const a = (original.categories ?? []).map(render);
  const b = (next.categories ?? []).map(render);
  for (const x of a.filter((x) => !b.includes(x))) lines.push(`- **categories**: removed ${x}`);
  for (const x of b.filter((x) => !a.includes(x))) lines.push(`- **categories**: added ${x}`);

  const la = original.linked ?? [];
  const lb = next.linked ?? [];
  for (const x of la.filter((x) => !lb.includes(x))) lines.push(`- **linked**: removed \`${x}\``);
  for (const x of lb.filter((x) => !la.includes(x))) lines.push(`- **linked**: added \`${x}\``);
  if (!lines.some((l) => l.startsWith('- **linked**')) && la.join() !== lb.join()) lines.push('- **linked**: reordered');
  return lines;
}

export interface IssueInput {
  meta: ArticleMeta;
  json: string;
  changes: string[];
  warnings: Warning[];
  acknowledged: boolean;
  notes: string;
  pageUrl: string;
}

/** Longest issue URL we will open; GitHub rejects very long query strings. */
export const MAX_ISSUE_URL = 7000;

export function issueBody(i: IssueInput, includeJson: boolean): string {
  const parts = [
    `Requested via the article editor (\`?edit=1\`) on ${i.pageUrl}`,
    '',
    `**Action:** replace \`content/articles/${i.meta.slug}/article.json\` with the JSON below, then run \`npm run content:check\` and \`npm run content:guard -- --slug ${i.meta.slug}\`.`,
    '',
    '### Changes',
    ...(i.changes.length ? i.changes : ['- _No changes_']),
  ];
  const risky = i.warnings.filter((w) => w.severity !== 'info');
  if (risky.length) {
    parts.push('', `### Link warnings${i.acknowledged ? ' (acknowledged by the submitter)' : ''}`, ...risky.map((w) => `- **${w.severity}**: ${w.text}`));
  }
  if (i.notes.trim()) parts.push('', '### Notes from the submitter', i.notes.trim());
  parts.push('', '### article.json', includeJson ? '```json\n' + i.json.trimEnd() + '\n```' : '_The JSON was too long for a link: it was copied to your clipboard. Paste it here between code fences._');
  return parts.join('\n');
}

export const ISSUE_REPO = 'https://github.com/canonn-science/canonn.science';

/** Builds the prefilled "new issue" address, dropping the inline JSON if the link would be too long. */
export function issueUrl(i: IssueInput): { url: string; jsonInBody: boolean } {
  const make = (includeJson: boolean) =>
    `${ISSUE_REPO}/issues/new?` +
    new URLSearchParams({ title: `Article metadata update: ${i.meta.title}`, labels: 'documentation', body: issueBody(i, includeJson) }).toString();
  const full = make(true);
  return full.length <= MAX_ISSUE_URL ? { url: full, jsonInBody: true } : { url: make(false), jsonInBody: false };
}
