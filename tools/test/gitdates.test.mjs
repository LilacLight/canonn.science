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

test('bulk commits are ignored for first-seen dates too', () => {
  const files = Array.from({ length: 5 }, (_, i) => `content/articles/s${i}/body.html`).join('\n');
  const { first } = parseGitLogRange(`\x012026-05-05T00:00:00Z\n${files}\n`, 3);
  assert.equal(first.size, 0);
});
