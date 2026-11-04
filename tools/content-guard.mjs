// Content guard: the deterministic security gate for article contributions.
//
//   node tools/content-guard.mjs --base origin/main     scan what a PR changed (CI)
//   node tools/content-guard.mjs --all                  scan every article (audit; legacy errors expected)
//   node tools/content-guard.mjs --slug my-article      scan one article folder
//
// Exit code 1 if any ERROR finding exists in the scanned set. WARN findings are
// written to the report for the AI/human reviewer. The report is Markdown, written
// to $GUARD_REPORT (default: guard-report.md).
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, scanHtml, classifyUrl } from './lib/policy.mjs';
import { loadArticles, loadTaxonomy } from './lib/content.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const taxonomy = loadTaxonomy();
const { articles, errors: contentErrors } = loadArticles(taxonomy);

let selected; // Set of slugs, or null = all
const outsideContent = [];
const touchedShared = [];
if (args.includes('--all')) {
  selected = null;
} else if (opt('--slug')) {
  selected = new Set([opt('--slug')]);
} else {
  const base = opt('--base') ?? 'origin/main';
  const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRD', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8' });
  selected = new Set();
  for (const f of out.split('\n').filter(Boolean)) {
    const m = /^content\/articles\/([^/]+)\//.exec(f);
    if (m) selected.add(m[1]);
    else if (f.startsWith('content/shared-media/')) touchedShared.push(f);
    else outsideContent.push(f);
  }
}

const inScope = (slug) => selected === null || selected.has(slug);
const report = [];
let errorCount = 0;
let warnCount = 0;

// Structural errors (schema, file types, sizes, magic bytes, missing media) for scanned articles.
const structural = contentErrors.filter((e) => {
  const slug = e.split(':')[0];
  return selected === null ? true : selected.has(slug) || slug === 'shared-media' && touchedShared.length > 0;
});

for (const a of articles.filter((x) => inScope(x.slug))) {
  const scripts = a.meta.scripts === true;
  const findings = scanHtml(a.html, { scripts });
  if (scripts) findings.unshift({ level: 'warn', rule: 'scripts-enabled', detail: 'article.json sets "scripts": true, so this article runs code on the site origin. A maintainer must review every script.' });
  // Metadata strings are never rendered as HTML, but they must not smuggle markup or odd links either.
  for (const [k, v] of Object.entries(a.meta)) {
    if (typeof v === 'string' && /[‪-‮⁦-⁩]/.test(v)) findings.push({ level: 'error', rule: 'bidi-control-character', detail: `in metadata "${k}"` });
  }
  if (a.meta.original_link && classifyUrl(a.meta.original_link) !== 'https' && classifyUrl(a.meta.original_link) !== 'http') findings.push({ level: 'error', rule: 'bad-original-link', detail: a.meta.original_link });
  if (!findings.length) continue;
  const errs = findings.filter((f) => f.level === 'error');
  errorCount += errs.length;
  warnCount += findings.length - errs.length;
  report.push(`### ${a.slug}${a.legacy ? ' (migrated legacy article)' : ''}`);
  for (const f of findings) report.push(`- **${f.level.toUpperCase()}** \`${f.rule}\` — ${f.detail.replace(/`/g, "'")}`);
  report.push('');
}

if (structural.length) {
  errorCount += structural.length;
  report.unshift('### Structure and metadata', ...structural.map((e) => `- **ERROR** ${e.replace(/`/g, "'")}`), '');
}
if (outsideContent.length) {
  report.unshift('### Files changed outside `content/`', 'These need a maintainer (see CODEOWNERS):', ...outsideContent.map((f) => `- \`${f}\``), '');
}
if (touchedShared.length) {
  report.unshift('### Shared media changed', 'Shared files affect many articles; a maintainer should review:', ...touchedShared.map((f) => `- \`${f}\``), '');
}

if (selected !== null && selected.size > 1) {
  report.unshift('### More than one article changed', `This change touches ${selected.size} article folders (${[...selected].join(', ')}). A new-article PR should normally touch exactly one.`, '');
  warnCount++;
}
const scope = selected === null ? 'all articles' : [...selected].join(', ') || 'no article folders';
const md = [`## Content guard report`, '', `Scope: ${scope}`, `Errors: ${errorCount} · Warnings: ${warnCount}`, '', ...report].join('\n');
writeFileSync(process.env.GUARD_REPORT ?? path.join(ROOT, 'guard-report.md'), md + '\n');
console.log(md);
process.exit(errorCount ? 1 : 0);
