# Adding or editing an article

Each article is one folder in `content/articles/`. The folder name is the article's slug and its URL:
`/<section>/<slug>`.

```
content/articles/my-discovery/
  article.json       metadata (required)
  body.md            the article body, Markdown ... OR
  body.html          ... HTML. Use exactly one of the two.
  media/             images, pdf, mp4/webm, mp3/ogg used only by this article
```

## article.json

```json
{
  "title": "My Discovery",
  "slug": "my-discovery",
  "section": "codex",
  "date": "2026-11-04",
  "excerpt": "One or two plain-text sentences for the article card.",
  "banner": "media/banner.png",
  "categories": [
    { "category": "Biology & Geology", "subs": ["Surface Biology"] }
  ]
}
```

| Field | Notes |
|---|---|
| `title`, `slug`, `section`, `date` | Required. `slug` must equal the folder name (lowercase, digits, hyphens). `date` is ISO 8601. |
| `excerpt` | Plain text, max 600 characters, no `<` or `>`. If omitted, the start of the body is used. |
| `banner` | Optional. `media/<file>` or `shared-media/<path>`. |
| `categories` | At least one. Names must exist in `content/taxonomy.json`; `subs` may be empty. An article may be in several categories. |
| `modified`, `original_link`, `source` | Optional. |

## Writing the body

- Reference your own files as `media/<file>`, e.g. `![Scan](media/scan.png)`.
- Files used by more than one article live in `content/shared-media/<year>/<month>/` and are
  referenced as `shared-media/<year>/<month>/<file>`.
- Allowed: normal text formatting, headings, lists, tables, images, links (http, https, mailto),
  and iframes from the hosts in `content-policy.json` (YouTube, Vimeo, Google Docs, Plotly,
  Sketchfab, Yumpu).
- Not allowed (removed or blocked): scripts (unless you opt in, below), styles, forms, inline event handlers, `javascript:`
  and `data:` URLs, other iframes, SVG, unknown file types. See `content-policy.json`.

## Articles that need JavaScript

If an article must run code (for example to call a Canonn API), add `"scripts": true` to `article.json`. Then:

- `<script>`, inline event handlers, `<form>`, `<input>`, `<button>` and `<style>` are kept.
- External scripts must come from a host listed in `scripts.scriptHosts` in `content-policy.json`; `https://` only.
- API calls go to hosts listed in `scripts.apiHosts`. Adding a host is a change to the policy file, which is outside your article
  folder and so needs a maintainer.
- The script runs on the real site, so it is reviewed line by line. Keep it small and readable, with no minified or obfuscated code.
- The PR gets an automatic "scripts enabled" warning and will not merge without a maintainer.

## Check it locally

```
npm run content:check                       # validate every article
npm run content:guard -- --slug my-discovery
npm start                                   # build the content + dev server
```

A pull request runs the same checks, an automated AI review (see `docs/CONTENT-REVIEW.md`), and
needs maintainer approval before merge.
