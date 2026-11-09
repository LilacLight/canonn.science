// Post-build step: writes a static copy of the SPA shell for every article, topic and category
// URL, with Open Graph / Twitter tags filled in. Crawlers that do not run JavaScript (Bluesky's
// link-card fetcher, Discord, Mastodon...) then see the right title, excerpt and banner image.
// The Angular app boots over the top as normal.
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ROOT } from './lib/policy.mjs';

const DIST = path.join(ROOT, 'dist', 'canonn-science', 'browser');
const GEN = path.join(ROOT, '.generated');
const SITE = 'https://' + readFileSync(path.join(ROOT, 'public', 'CNAME'), 'utf8').trim();
const DEFAULT_IMAGE = '/brand/logo.png';
const MAX_CARD_BYTES = 900_000; // Bluesky drops card images much over 1 MB; stay safely under

const shell = readFileSync(path.join(DIST, 'index.html'), 'utf8');
const json = (f) => JSON.parse(readFileSync(path.join(GEN, 'content', f), 'utf8'));
const manifest = json('manifest.json');
const nav = json('navigation.json');
const topics = json('categories.json');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (s, n = 280) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
let warnings = 0;
let resized = 0;

const cardDir = path.join(DIST, 'assets', 'share');
const cardCache = new Map();

// Images over the limit are re-encoded as a smaller JPEG (max 1200px wide) just for the card.
async function cardImage(img) {
  if (!img) return SITE + DEFAULT_IMAGE;
  if (/^https:\/\//.test(img)) return img;
  if (cardCache.has(img)) return cardCache.get(img);
  const file = path.join(DIST, img.replace(/^\//, ''));
  let url = SITE + img;
  if (existsSync(file) && statSync(file).size > MAX_CARD_BYTES) {
    const name = createHash('sha1').update(img).digest('hex').slice(0, 16) + '.jpg';
    mkdirSync(cardDir, { recursive: true });
    const out = path.join(cardDir, name);
    for (const [width, quality] of [[1200, 82], [1200, 70], [1000, 65], [800, 60]]) {
      const buf = await sharp(file).rotate().resize({ width, withoutEnlargement: true }).flatten({ background: '#000' }).jpeg({ quality, mozjpeg: true }).toBuffer();
      writeFileSync(out, buf);
      if (buf.length <= MAX_CARD_BYTES) break;
    }
    if (statSync(out).size > MAX_CARD_BYTES) {
      console.warn(`warning: could not shrink ${img} under ${MAX_CARD_BYTES} bytes`);
      warnings++;
    }
    resized++;
    url = `${SITE}/assets/share/${name}`;
  }
  cardCache.set(img, url);
  return url;
}

async function page(route, { title, description, image, type }) {
  const url = `${SITE}${route}`;
  const img = await cardImage(image);
  const tags = [
    ['og:site_name', 'Canonn Interstellar Research Group'], ['og:type', type], ['og:title', title],
    ['og:description', description], ['og:url', url], ['og:image', img],
    ['twitter:card', 'summary_large_image'], ['twitter:title', title], ['twitter:description', description], ['twitter:image', img],
  ].map(([k, v]) => `  <meta ${k.startsWith('og:') ? 'property' : 'name'}="${k}" content="${esc(v)}">`).join('\n');
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)} | Canonn Interstellar Research Group</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(description)}">`)
    .replace('</head>', `  <link rel="canonical" href="${esc(url)}">\n${tags}\n</head>`);
  const dir = path.join(DIST, ...route.split('/').filter(Boolean));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), html);
}

let n = 0;
for (const a of manifest) {
  const route = !a.section ? `/article/${a.slug}` : a.section === 'pages' ? `/${a.slug}` : `/${a.section}/${a.slug}`;
  await page(route, { title: a.title, description: clip(a.excerpt || a.title), image: a.banner_image, type: 'article' });
  n++;
}
for (const t of topics) {
  await page(`/category/${t.slug}`, { title: t.name, description: `Canonn articles about ${t.name}.`, image: t.image, type: 'website' });
  n++;
}
for (const c of nav.categories) {
  await page(`/topics/${c.slug}`, { title: c.name, description: clip(c.description || `Canonn articles about ${c.name}.`), image: c.thumb, type: 'website' });
  n++;
  for (const s of c.subs) {
    await page(`/topics/${c.slug}/${s.slug}`, { title: `${s.name} – ${c.name}`, description: `${s.count} Canonn articles on ${s.name} (${c.name}).`, image: s.thumb ?? c.thumb, type: 'website' });
    n++;
  }
}
console.log(`Wrote ${n} share pages with Open Graph tags (${resized} oversized banner(s) resized for cards, ${warnings} warning(s)).`);
