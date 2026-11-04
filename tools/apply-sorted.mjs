// Applies a category export from the in-app sorter (/analysis/sorter -> Download,
// "canonn-sorted-articles.json") to the per-article metadata.
//
//   node tools/apply-sorted.mjs path/to/canonn-sorted-articles.json [--dry-run]
//
// Only the "categories" field of each existing article.json is rewritten. Categories or
// sub-categories that are not in content/taxonomy.json are added to the taxonomy.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ARTICLES, CONTENT, loadTaxonomy } from './lib/content.mjs';

const file = process.argv[2];
const dry = process.argv.includes('--dry-run');
if (!file) {
  console.error('usage: node tools/apply-sorted.mjs <canonn-sorted-articles.json> [--dry-run]');
  process.exit(2);
}
const sorted = JSON.parse(readFileSync(file, 'utf8'));
const taxonomy = loadTaxonomy();

for (const c of sorted.categories ?? []) {
  let t = taxonomy.categories.find((x) => x.name === c.name);
  if (!t) taxonomy.categories.push((t = { name: c.name, description: null, subs: [] }));
  for (const s of c.subs ?? []) if (!t.subs.includes(s.name)) t.subs.push(s.name);
}

let changed = 0;
const unknown = [];
for (const [slug, assignments] of Object.entries(sorted.assignments ?? {})) {
  const metaPath = path.join(ARTICLES, slug, 'article.json');
  if (!existsSync(metaPath)) { unknown.push(slug); continue; }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const categories = assignments.map((a) => ({
    category: a.category,
    subs: ('subs' in a ? a.subs : a.sub ? [a.sub] : []).filter(Boolean),
  }));
  if (JSON.stringify(categories) !== JSON.stringify(meta.categories)) {
    meta.categories = categories;
    changed++;
    if (!dry) writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  }
}
if (!dry) writeFileSync(path.join(CONTENT, 'taxonomy.json'), JSON.stringify(taxonomy, null, 2) + '\n');
console.log(`${dry ? '[dry run] ' : ''}${changed} article(s) updated; ${unknown.length} slug(s) in the export have no article folder${unknown.length ? ': ' + unknown.slice(0, 8).join(', ') : ''}`);
