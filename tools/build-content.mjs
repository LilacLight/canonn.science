// Validates content/ and generates the site's indexes into .generated/.
//
//   node tools/build-content.mjs            validate + generate
//   node tools/build-content.mjs --check    validate only
//
// Output (.generated/, git-ignored, picked up by angular.json):
//   content/manifest.json  navigation.json  categories.json  search-index.json
//   content/articles/<slug>.json   (sanitised, pre-segmented article)
//   media/<slug>/...  media/_shared/...
import { copyFileSync, linkSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, sanitizeBody, rewriteMediaUrl } from './lib/policy.mjs';
import { loadArticles, loadTaxonomy, resolveMedia, isExternalBannerOk, walk, SHARED, ARTICLES } from './lib/content.mjs';
import { splitLegacyWidgets, moveHeadingAnchors } from './lib/legacy.mjs';

const OUT = path.join(ROOT, '.generated');
const checkOnly = process.argv.includes('--check');

const taxonomy = loadTaxonomy();
const { articles, errors, warnings } = loadArticles(taxonomy);

if (warnings.length) console.warn(`${warnings.length} warning(s):\n  ` + warnings.slice(0, 15).join('\n  ') + (warnings.length > 15 ? `\n  ... and ${warnings.length - 15} more` : ''));
if (errors.length) {
  console.error(`\n${errors.length} content error(s):\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(`Validated ${articles.length} articles.`);
if (checkOnly) process.exit(0);

// ---------------------------------------------------------------- helpers
const slugify = (name, taken) => {
  const base = name.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'topic';
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
};
const write = (rel, data) => {
  const file = path.join(OUT, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
};
const place = (src, dest) => {
  mkdirSync(path.dirname(dest), { recursive: true });
  try { linkSync(src, dest); } catch { copyFileSync(src, dest); }
};
const stripTags = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

rmSync(OUT, { recursive: true, force: true });

// ---------------------------------------------------------------- articles
const built = new Map(); // slug -> record
for (const a of articles) {
  const { meta, slug } = a;
  const segments = splitLegacyWidgets(moveHeadingAnchors(a.html)).map((seg) => ('html' in seg ? { html: sanitizeBody(seg.html, slug, { scripts: meta.scripts === true }) } : seg));
  const text = stripTags(segments.map((s) => s.html ?? '').join(' '));
  const bannerFile = meta.banner && /^(media|shared-media)\//.test(meta.banner) ? resolveMedia(slug, meta.banner) : null;
  built.set(slug, {
    slug,
    section: meta.section,
    title: meta.title,
    date: meta.date ?? null,
    modified: meta.modified ?? null,
    author: meta.author ?? null,
    excerpt: meta.excerpt || (text.length > 200 ? text.slice(0, 197).trimEnd() + '…' : text),
    banner_image: bannerFile ? rewriteMediaUrl(meta.banner, slug) : meta.banner && isExternalBannerOk(meta.banner) ? meta.banner : null,
    source: meta.source ?? 'community',
    scripts: meta.scripts === true,
    original_link: meta.original_link ?? null,
    placements: meta.categories,
    segments,
    text,
  });

  // media
  for (const f of walk(path.join(ARTICLES, slug, 'media'))) {
    place(f, path.join(OUT, 'media', slug, path.relative(path.join(ARTICLES, slug, 'media'), f)));
  }
}
for (const f of walk(SHARED)) place(f, path.join(OUT, 'media', '_shared', path.relative(SHARED, f)));

// ---------------------------------------------------------------- navigation
const dateKey = (s) => built.get(s).date ?? '';
const newestFirst = (slugs) => [...new Set(slugs)].sort((x, y) => dateKey(y).localeCompare(dateKey(x)));

// category -> sub|null -> slugs
const tree = new Map(taxonomy.categories.map((c) => [c.name, new Map([[null, []], ...c.subs.map((s) => [s, []])])]));
for (const [slug, rec] of built) {
  for (const p of rec.placements) {
    const subs = tree.get(p.category);
    for (const s of p.subs.length ? p.subs : [null]) subs.get(s).push(slug);
  }
}

const catSlugs = new Set();
const categories = [];
for (const c of taxonomy.categories) {
  const subs = tree.get(c.name);
  const cat = { name: c.name, slug: slugify(c.name, catSlugs), description: c.description ?? null, subs: [], articles: newestFirst(subs.get(null)) };
  const subSlugs = new Set();
  for (const [name, slugs] of subs) {
    if (name !== null && slugs.length) cat.subs.push({ name, slug: slugify(name, subSlugs), articles: newestFirst(slugs) });
  }
  if (cat.subs.length && cat.articles.length) {
    cat.subs.push({ name: taxonomy.otherName, slug: slugify(taxonomy.otherName, subSlugs), articles: cat.articles });
    cat.articles = [];
  }
  cat.count = cat.subs.reduce((n, s) => n + s.articles.length, 0) + cat.articles.length;
  if (cat.count) categories.push(cat);
}

// Thumbnails: handed out greedily so no two tiles share a picture if it can be avoided.
const used = new Map();
const pick = (slugs) => {
  const images = [...new Set(slugs.map((s) => built.get(s).banner_image).filter(Boolean))];
  if (!images.length) return null;
  const best = images.reduce((a, b) => ((used.get(b) ?? 0) < (used.get(a) ?? 0) ? b : a));
  used.set(best, (used.get(best) ?? 0) + 1);
  return best;
};
const allOf = (c) => [...c.subs.flatMap((s) => s.articles), ...c.articles];
for (const c of categories) c.thumb = pick(allOf(c));
for (const c of categories) {
  for (const s of c.subs) { s.thumb = pick(s.articles); s.count = s.articles.length; }
}

// ---------------------------------------------------------------- per-article category info
const topCats = new Map();
for (const c of categories) for (const s of new Set(allOf(c))) (topCats.get(s) ?? topCats.set(s, []).get(s)).push({ name: c.name, slug: c.slug });

const manifest = [...built.values()]
  .map((r) => ({ slug: r.slug, section: r.section, title: r.title, date: r.date, excerpt: r.excerpt, categories: topCats.get(r.slug) ?? [], banner_image: r.banner_image, source: r.source }))
  .sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''));

const searchIndex = [...built.values()].map((r) => ({ slug: r.slug, section: r.section, title: r.title, categories: (topCats.get(r.slug) ?? []).map((c) => c.slug), text: r.text }));

const catAgg = new Map();
for (const m of manifest) {
  for (const c of m.categories) {
    const agg = catAgg.get(c.slug) ?? catAgg.set(c.slug, { name: c.name, slug: c.slug, count: 0, image: null, latest_date: null }).get(c.slug);
    agg.count++;
    agg.latest_date ??= m.date;
  }
}
const topicList = [...catAgg.values()].sort((a, b) => (b.latest_date ?? '').localeCompare(a.latest_date ?? '') || b.count - a.count);
const usedImages = new Set();
for (const t of topicList) {
  const img = manifest.find((m) => m.banner_image && !usedImages.has(m.banner_image) && m.categories.some((c) => c.slug === t.slug))?.banner_image;
  if (img) { t.image = img; usedImages.add(img); }
}

write('content/manifest.json', manifest);
write('content/navigation.json', { categories });
write('content/categories.json', topicList);
write('content/search-index.json', searchIndex);
for (const r of built.values()) {
  const { placements, text, ...publish } = r;
  write(`content/articles/${r.slug}.json`, { ...publish, categories: topCats.get(r.slug) ?? [] });
}

const unsorted = [...built.values()].filter((r) => !topCats.has(r.slug)).length;
console.log(`Wrote ${built.size} articles, ${categories.length} categories (${categories.reduce((n, c) => n + c.subs.length, 0)} sub-categories); ${unsorted} article(s) not in any category.`);
