# canonn.science

Angular 18 site for the Canonn Interstellar Research Group archive. Every article is a folder of
plain files; indexes, navigation and search are generated at build time (locally and in GitHub Actions).

```
content/
  articles/<slug>/     article.json + body.md|body.html + media/
  shared-media/        files used by 2+ articles
  taxonomy.json        categories and sub-categories (+ descriptions, order)
content-policy.json    what articles may contain (tags, URL schemes, embed hosts, file types)
tools/                 build-content, content-guard, apply-sorted, one-off migration
docs/                  ADDING-ARTICLES.md, CONTENT-REVIEW.md (AI + human review rules)
src/                   Angular app
.generated/            build output (git-ignored): manifest, navigation, search index, sanitised articles, media
```

## Commands (Node 20+)

| | |
|---|---|
| `npm ci` | install |
| `npm start` | generate content, then dev server on :4200 |
| `npm run build` | generate content, then production build to `dist/canonn-science/browser` |
| `npm run content:check` | validate every article (schema, categories, media, file types) |
| `npm run content:guard -- --slug x` | security scan of one article (`--all`, or `--base origin/main` for a PR) |
| `npm run test:tools` | unit tests for the sanitiser and scanner |

## Security model

0. **Scope**: a new-article PR may only change one folder under `content/articles/`; the guard and AI review warn about anything else, and CODEOWNERS routes it to a maintainer.
1. **Policy** (`content-policy.json`) is the single rulebook; changes need a maintainer.
2. **Content guard** (CI, blocking) scans changed articles for scripts, handlers, bad URL schemes, unknown iframe
   hosts, hidden-text tricks, bidi characters, bad file types/sizes/magic bytes, and edits outside article folders.
3. **Build sanitiser** rewrites every body to the policy, so even a missed attack is stripped before publishing. Scripts survive only for articles that set `"scripts": true` (reviewed by a maintainer), only from `scripts.scriptHosts`, and API hosts are listed in `scripts.apiHosts`. Scripts run on the site origin; they are not sandboxed.
4. **Runtime**: the app runs a second sanitising pass and sandboxes allowlisted iframes.
5. **AI review** (advisory, `docs/CONTENT-REVIEW.md`) catches intent and deception the rules cannot, and treats article text as
   untrusted data. **CODEOWNERS** puts a maintainer on everything that is not a single article folder.

## Deployment

`.github/workflows/deploy.yml` builds on every push to `main` and publishes to GitHub Pages
(with a `404.html` SPA fallback). The app assumes it is served from the site root (custom domain).

## Migrating from the archive

`tools/migrate_archive.py` was the one-off conversion from `archive/pipeline/content`. Its output
and `tools/migration-report.json` (missing media, articles that contained scripts) are kept for reference.
Articles with `"source": "wayback" | "articles.json" | "manual"` are treated as legacy: missing dates/categories are tolerated.
