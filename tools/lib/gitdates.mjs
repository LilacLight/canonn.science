// First- and last-change dates per article, taken from git history.
//
// An article's "updated" date is the newest commit that touched its folder, and its "first seen"
// date is the earliest, ignoring bulk commits (site-wide fixes that touch many articles at once
// would otherwise flood "recently updated", or make a bulk migration commit look like every
// article was freshly added). Returns empty maps when git history is unavailable (no git, or a
// shallow clone), in which case only an explicit `modified` in article.json counts.
import { execFileSync } from 'node:child_process';
import { ROOT } from './policy.mjs';

/** A commit touching more than this many article folders is treated as a bulk edit. */
export const BULK_COMMIT_ARTICLES = 15;

const git = (args) => execFileSync('git', ['-c', 'core.quotepath=off', ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

/**
 * Parses `git log --name-only` output produced with the \x01<iso date> marker. Returns both the
 * newest and the earliest commit date per article slug (the earliest is when the article first
 * appeared in this repo's history, used to tell a freshly-migrated article from a long-standing
 * one that was just edited). Exported for tests.
 */
export function parseGitLogRange(out, bulkLimit = BULK_COMMIT_ARTICLES) {
  const latest = new Map();
  const first = new Map();
  for (const block of out.split('\x01')) {
    if (!block.trim()) continue;
    const [date, ...files] = block.split('\n');
    const d = date.trim();
    const slugs = new Set();
    for (const f of files) {
      const m = /^content\/articles\/([^/]+)\//.exec(f.trim());
      if (m) slugs.add(m[1]);
    }
    if (!slugs.size || slugs.size > bulkLimit) continue;
    for (const s of slugs) {
      const prevLatest = latest.get(s);
      if (!prevLatest || d > prevLatest) latest.set(s, d);
      const prevFirst = first.get(s);
      if (!prevFirst || d < prevFirst) first.set(s, d);
    }
  }
  return { latest, first };
}

/** Back-compat wrapper: just the newest-commit-per-article map. Exported for tests. */
export function parseGitLog(out, bulkLimit = BULK_COMMIT_ARTICLES) {
  return parseGitLogRange(out, bulkLimit).latest;
}

/** Returns `{ latest, first }`, each a Map of slug -> ISO date. Empty maps when git history is unavailable. */
export function loadGitDates() {
  try {
    if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
      console.warn('Shallow git clone: article update dates fall back to `modified` in article.json (use fetch-depth: 0).');
      return { latest: new Map(), first: new Map() };
    }
    return parseGitLogRange(git(['log', '--format=%x01%cI', '--name-only', '--', 'content/articles']));
  } catch {
    return { latest: new Map(), first: new Map() };
  }
}
