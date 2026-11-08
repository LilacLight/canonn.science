import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitLog, parseGitLogRange } from '../lib/gitdates.mjs';

test('newest commit per article wins, other paths are ignored', () => {
  const log = '\x012026-03-02T10:00:00Z\ncontent/articles/a/body.html\nsrc/x.ts\n\n\x012026-01-01T10:00:00Z\ncontent/articles/a/article.json\ncontent/articles/b/body.html\n';
  const m = parseGitLog(log);
  assert.equal(m.get('a'), '2026-03-02T10:00:00Z');
  assert.equal(m.get('b'), '2026-01-01T10:00:00Z');
  assert.equal(m.size, 2);
});

test('bulk commits do not count as updates', () => {
  const files = Array.from({ length: 5 }, (_, i) => `content/articles/s${i}/body.html`).join('\n');
  assert.equal(parseGitLog(`\x012026-05-05T00:00:00Z\n${files}\n`, 3).size, 0);
  assert.equal(parseGitLog(`\x012026-05-05T00:00:00Z\n${files}\n`, 5).size, 5);
});

test('earliest commit per article is tracked separately from the newest', () => {
  const log = '\x012026-03-02T10:00:00Z\ncontent/articles/a/body.html\n\n\x012026-01-01T10:00:00Z\ncontent/articles/a/article.json\ncontent/articles/b/body.html\n';
  const { latest, first } = parseGitLogRange(log);
  assert.equal(latest.get('a'), '2026-03-02T10:00:00Z');
  assert.equal(first.get('a'), '2026-01-01T10:00:00Z');
  assert.equal(latest.get('b'), '2026-01-01T10:00:00Z');
  assert.equal(first.get('b'), '2026-01-01T10:00:00Z');
});

test('bulk commits are excluded from latest, but still count as first-seen', () => {
  const files = Array.from({ length: 5 }, (_, i) => `content/articles/s${i}/body.html`).join('\n');
  const { latest, first } = parseGitLogRange(`\x012026-05-05T00:00:00Z\n${files}\n`, 3);
  assert.equal(latest.size, 0);
  assert.equal(first.size, 5);
  assert.equal(first.get('s0'), '2026-05-05T00:00:00Z');
});

test('a later small edit does not overwrite an article\'s bulk-introduction first-seen date', () => {
  // git log is newest-first: the small non-bulk edit appears before the old bulk-migration commit.
  const bulkFiles = Array.from({ length: 5 }, (_, i) => `content/articles/s${i}/body.html`).join('\n');
  const log = `\x012026-11-07T00:00:00Z\ncontent/articles/s0/body.html\n\n\x012026-05-05T00:00:00Z\n${bulkFiles}\n`;
  const { latest, first } = parseGitLogRange(log, 3);
  assert.equal(first.get('s0'), '2026-05-05T00:00:00Z');
  assert.equal(latest.get('s0'), '2026-11-07T00:00:00Z');
});

test('commit dates with different UTC offsets compare chronologically, not lexically', () => {
  // As strings, '...-06T21...-05:00' sorts before '...-07T02...+02:00' (6 < 7), but as instants
  // the -05:00 commit (2026-11-07T02:00:00Z) is actually later than the +02:00 one (2026-11-07T00:00:00Z).
  const log = '\x012026-11-06T21:00:00-05:00\ncontent/articles/a/body.html\n\n\x012026-11-07T02:00:00+02:00\ncontent/articles/a/body.html\n';
  const { latest, first } = parseGitLogRange(log);
  assert.equal(latest.get('a'), '2026-11-06T21:00:00-05:00');
  assert.equal(first.get('a'), '2026-11-07T02:00:00+02:00');
});
