// Loads and validates content/articles/<slug>/ folders.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { ROOT, policy } from './policy.mjs';

export const CONTENT = path.join(ROOT, 'content');
export const ARTICLES = path.join(CONTENT, 'articles');
export const SHARED = path.join(CONTENT, 'shared-media');

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SECTION = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?)?$/;
const KEYS = ['title', 'slug', 'section', 'date', 'modified', 'excerpt', 'banner', 'categories', 'format', 'source', 'original_link', 'scripts', 'author'];
/** `source` values written by the archive migration. Their articles get leniency (no date, no category). */
export const LEGACY_SOURCES = new Set(['wayback', 'articles.json', 'manual']);

export function loadTaxonomy() {
  return JSON.parse(readFileSync(path.join(CONTENT, 'taxonomy.json'), 'utf8'));
}

export function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Resolves a `media/x` or `shared-media/x` reference to a file on disk, or null. Rejects traversal. */
export function resolveMedia(slug, ref) {
  let decoded;
  try { decoded = decodeURIComponent(ref); } catch { return null; }
  let base, rel;
  if (decoded.startsWith('media/')) { base = path.join(ARTICLES, slug, 'media'); rel = decoded.slice(6); }
  else if (decoded.startsWith('shared-media/')) { base = SHARED; rel = decoded.slice(13); }
  else return null;
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep)) return null;
  return existsSync(full) && statSync(full).isFile() ? full : null;
}

export function isExternalBannerOk(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (policy.externalBannerHosts ?? []).includes(u.hostname);
  } catch {
    return false;
  }
}

export function renderBody(raw, format) {
  if (format === 'md') return marked.parse(raw, { gfm: true, async: false, mangle: false, headerIds: false });
  return raw;
}

/**
 * Loads every article folder. Returns { articles, errors, warnings }.
 * Each article: { slug, dir, meta, format, raw, html, legacy }.
 */
export function loadArticles(taxonomy) {
  const errors = [];
  const warnings = [];
  const articles = [];
  const err = (slug, msg) => errors.push(`${slug}: ${msg}`);
  const warn = (slug, msg) => warnings.push(`${slug}: ${msg}`);
  const subsOf = new Map(taxonomy.categories.map((c) => [c.name, new Set(c.subs)]));

  for (const entry of readdirSync(ARTICLES, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      err(entry.name, 'stray file in content/articles (only article folders are allowed)');
      continue;
    }
    const slug = entry.name;
    const dir = path.join(ARTICLES, slug);
    if (!SLUG.test(slug)) { err(slug, 'folder name must be lowercase letters, digits and hyphens'); continue; }
    if (policy.reservedSlugs.includes(slug)) { err(slug, 'slug is reserved by the app'); continue; }

    const metaPath = path.join(dir, 'article.json');
    if (!existsSync(metaPath)) { err(slug, 'missing article.json'); continue; }
    let meta;
    try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch (e) { err(slug, `article.json is not valid JSON (${e.message})`); continue; }

    for (const k of Object.keys(meta)) if (!KEYS.includes(k)) err(slug, `unknown metadata key "${k}"`);
    const legacy = LEGACY_SOURCES.has(meta.source);

    if (meta.slug !== slug) err(slug, `metadata slug "${meta.slug}" must match the folder name`);
    if (typeof meta.title !== 'string' || !meta.title.trim() || meta.title.length > 200) err(slug, 'title is required (max 200 characters)');
    if (typeof meta.section !== 'string' || !SECTION.test(meta.section)) err(slug, 'section must be lowercase letters, digits and hyphens');
    for (const k of ['date', 'modified']) {
      if (meta[k] == null) continue;
      if (typeof meta[k] !== 'string' || !ISO.test(meta[k]) || Number.isNaN(Date.parse(meta[k]))) err(slug, `${k} must be an ISO 8601 date`);
    }
    if (meta.date == null && !legacy) err(slug, 'date is required');
    if (meta.excerpt != null && (typeof meta.excerpt !== 'string' || meta.excerpt.length > 600)) err(slug, 'excerpt must be plain text, max 600 characters');
    if (meta.excerpt && /[<>]/.test(meta.excerpt)) err(slug, 'excerpt must be plain text (no < or >)');
    if (meta.author != null && (typeof meta.author !== 'string' || !meta.author.trim() || meta.author.length > 200)) err(slug, 'author must be plain text, max 200 characters');
    if (meta.author && /[<>]/.test(meta.author)) err(slug, 'author must be plain text (no < or >)');
    if (meta.scripts != null && typeof meta.scripts !== 'boolean') err(slug, 'scripts must be true or false');
    if (meta.original_link != null && !/^https?:\/\//.test(meta.original_link)) err(slug, 'original_link must be an http(s) URL');

    if (!Array.isArray(meta.categories)) err(slug, 'categories must be an array');
    else {
      if (meta.categories.length === 0 && !legacy) err(slug, 'at least one category is required');
      for (const c of meta.categories) {
        const subs = subsOf.get(c?.category);
        if (!subs) { err(slug, `unknown category "${c?.category}" (see content/taxonomy.json)`); continue; }
        if (!Array.isArray(c.subs)) { err(slug, `category "${c.category}": subs must be an array`); continue; }
        for (const s of c.subs) if (!subs.has(s)) err(slug, `unknown sub-category "${s}" in "${c.category}"`);
      }
    }

    // Body: exactly one of body.html / body.md
    const hasHtml = existsSync(path.join(dir, 'body.html'));
    const hasMd = existsSync(path.join(dir, 'body.md'));
    if (hasHtml === hasMd) { err(slug, 'exactly one of body.html or body.md is required'); continue; }
    const format = hasMd ? 'md' : 'html';
    if (meta.format && meta.format !== format) err(slug, `format "${meta.format}" does not match the body file (${format})`);
    const bodyFile = path.join(dir, `body.${format}`);
    if (statSync(bodyFile).size > policy.maxBodyBytes) err(slug, 'body is too large');
    const raw = readFileSync(bodyFile, 'utf8');
    const html = renderBody(raw, format);

    // Folder contents
    for (const f of walk(dir)) {
      const rel = path.relative(dir, f).split(path.sep).join('/');
      if (rel === 'article.json' || rel === `body.${format}`) continue;
      if (!rel.startsWith('media/')) { err(slug, `unexpected file "${rel}" (only article.json, one body file and media/ are allowed)`); continue; }
      checkMediaFile(slug, f, rel, err);
    }

    // Banner
    if (meta.banner) {
      if (/^(media|shared-media)\//.test(meta.banner)) {
        if (!resolveMedia(slug, meta.banner)) err(slug, `banner "${meta.banner}" does not exist`);
      } else if (isExternalBannerOk(meta.banner)) {
        // allowlisted thumbnail host (e.g. YouTube poster frames)
      } else if (!(legacy && meta.banner.startsWith('/assets/media/'))) err(slug, 'banner must be a media/ or shared-media/ path');
    }

    // Relative references in the body
    for (const m of html.matchAll(/(?:src|href|poster|srcset)\s*=\s*"([^"]*)"/gi)) {
      for (const ref of m[0].toLowerCase().startsWith('srcset') ? m[1].split(',').map((p) => p.trim().split(/\s+/)[0]) : [m[1]]) {
        if (!/^(media|shared-media)\//.test(ref)) continue;
        if (!resolveMedia(slug, ref)) err(slug, `body references missing file "${ref}"`);
      }
    }
    const legacyRefs = (html.match(/\/assets\/media\//g) ?? []).length;
    if (legacyRefs) {
      if (legacy) warn(slug, `${legacyRefs} legacy /assets/media reference(s) to files that were never archived`);
      else err(slug, 'body uses /assets/media/ URLs; put files in the article\'s media/ folder and use media/<file>');
    }

    articles.push({ slug, dir, meta, format, raw, html, legacy });
  }

  // Shared media
  for (const f of walk(SHARED)) checkMediaFile('shared-media', f, path.relative(SHARED, f).split(path.sep).join('/'), err);

  // Stray top-level content files
  for (const e of readdirSync(CONTENT)) {
    if (!['articles', 'shared-media', 'taxonomy.json'].includes(e)) err('content', `unexpected entry "${e}"`);
  }
  return { articles, errors, warnings };
}

function checkMediaFile(owner, file, rel, err) {
  const ext = path.extname(file).toLowerCase();
  if (!policy.mediaExtensions.includes(ext)) { err(owner, `media file "${rel}" has a disallowed type (${ext || 'none'})`); return; }
  const size = statSync(file).size;
  if (size > policy.maxMediaFileBytes) err(owner, `media file "${rel}" is larger than ${policy.maxMediaFileBytes / 1048576} MB`);
  if (!magicOk(file, ext)) err(owner, `media file "${rel}" content does not look like a ${ext} file`);
}

const MAGIC = {
  '.png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8,
  '.jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  '.gif': (b) => b.subarray(0, 3).toString() === 'GIF',
  '.webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  '.avif': (b) => b.subarray(4, 8).toString() === 'ftyp',
  '.pdf': (b) => b.subarray(0, 5).toString() === '%PDF-',
  '.mp4': (b) => b.subarray(4, 8).toString() === 'ftyp',
  '.webm': (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  '.mp3': (b) => b.subarray(0, 3).toString() === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  '.ogg': (b) => b.subarray(0, 4).toString() === 'OggS',
  '.wav': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WAVE',
  '.json': (b) => /^\s*[\[{]/.test(b.toString('utf8')) || b[0] === 0xef,
};

import { openSync, readSync, closeSync } from 'node:fs';
function magicOk(file, ext) {
  const buf = Buffer.alloc(16);
  const fd = openSync(file, 'r');
  try { readSync(fd, buf, 0, 16, 0); } finally { closeSync(fd); }
  const check = MAGIC[ext];
  return check ? check(buf) : false;
}
