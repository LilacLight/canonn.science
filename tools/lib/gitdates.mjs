// Last-change dates per article, taken from git history.
//
// An article's "updated" date is the newest commit that touched its folder, ignoring bulk commits
// (site-wide fixes that touch many articles at once would otherwise flood "recently updated").
// Returns an empty map when git history is unavailable (no git, or a shallow clone), in which
// case only an explicit `modified` in article.json counts.
import { execFileSync } from 'node:child_process';
import { ROOT } from './policy.mjs';

/** A commit touching more than this many article folders is treated as a bulk edit. */
export const BULK_COMMIT_ARTICLES = 15;

const git = (args) => execFileSync('git', ['-c', 'core.quotepath=off', ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

/** Parses `git log --name-only` output produced with the \x01<iso date> marker. Exported for tests. */
export function parseGitLog(out, bulkLimit = BULK_COMMIT_ARTICLES) {
  const latest = new Map();
  for (const block of out.split('\x01')) {
    if (!block.trim()) continue;
    const [date, ...files] = block.split('\n');
    const slugs = new Set();
    for (const f of files) {
      const m = /^content\/articles\/([^/]+)\//.exec(f.trim());
      if (m) slugs.add(m[1]);
    }
    if (!slugs.size || slugs.size > bulkLimit) continue;
    for (const s of slugs) {
      const prev = latest.get(s);
      if (!prev || date.trim() > prev) latest.set(s, date.trim());
    }
  }
  return latest;
}

export function loadGitDates() {
  try {
    if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
      console.warn('Shallow git clone: article update dates fall back to `modified` in article.json (use fetch-depth: 0).');
      return new Map();
    }
    return parseGitLog(git(['log', '--format=%x01%cI', '--name-only', '--', 'content/articles']));
  } catch {
    return new Map();
  }
}
