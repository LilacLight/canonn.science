import { Component, Input, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { ArticleSummary, ContentService, NavCategory } from '../services/content.service';
import { SITE_ORIGIN } from './share-bluesky.component';
import {
  ArticleMeta, Draft, EditorData, EditorEntry, Warning,
  buildMeta, describeChanges, draftFrom, impact, issueUrl, metaToJson, validate,
} from './article-editor.model';

/**
 * Hidden editor for an article's article.json, shown only while the address carries `?edit=1`.
 * Nothing is saved from the browser: "Submit as GitHub issue" opens a prefilled issue holding the
 * new article.json, which a maintainer then saves into content/articles/<slug>/.
 */
@Component({
  selector: 'app-article-editor',
  standalone: true,
  imports: [NgFor, NgIf],
  template: `
    <button type="button" class="fab" (click)="open = !open" [attr.aria-expanded]="open">
      &#9998; {{ open ? 'Close editor' : 'Edit article.json' }}
    </button>

    <aside class="drawer" *ngIf="open" role="dialog" aria-label="Edit article.json">
      <p class="loading" *ngIf="!entry && !loadError">Loading editor data&hellip;</p>
      <p class="problem" *ngIf="loadError">{{ loadError }}</p>

      <form *ngIf="entry" (submit)="$event.preventDefault()" autocomplete="off">
        <h2>Edit article.json</h2>
        <p class="hint">
          Changes are not saved from here. When you are done, submit them as a GitHub issue and a maintainer will apply them.
          Remove <code>?edit=1</code> from the address to leave editing mode.
        </p>

        <section *ngIf="warnings.length" class="warnings" aria-live="polite">
          <h3>Check before you submit</h3>
          <p *ngFor="let w of warnings" class="warn" [class.danger]="w.severity === 'danger'" [class.caution]="w.severity === 'caution'" [class.info]="w.severity === 'info'">
            <strong>{{ label(w) }}</strong> {{ w.text }}
          </p>
        </section>

        <fieldset>
          <legend>Details</legend>
          <label>Title
            <input type="text" [value]="draft.title" (input)="set('title', $any($event.target).value)" />
          </label>
          <label>Slug <small>(read-only: it is the folder name and the end of the address)</small>
            <input type="text" [value]="meta.slug" readonly />
          </label>
          <label>Section <small>(first part of the address)</small>
            <input type="text" list="sections" [value]="draft.section" (input)="set('section', $any($event.target).value)" />
            <datalist id="sections"><option *ngFor="let s of sections" [value]="s"></option></datalist>
          </label>
          <label>Date <small>(ISO 8601, e.g. 2026-11-04)</small>
            <input type="text" [value]="draft.date" (input)="set('date', $any($event.target).value)" />
          </label>
          <label>Author
            <input type="text" [value]="draft.author" (input)="set('author', $any($event.target).value)" />
          </label>
          <label>Excerpt <small>({{ draft.excerpt.length }}/600, plain text)</small>
            <textarea rows="3" [value]="draft.excerpt" (input)="set('excerpt', $any($event.target).value)"></textarea>
          </label>
        </fieldset>

        <fieldset>
          <legend>Categories</legend>
          <div class="cat" *ngFor="let c of draft.categories; let i = index">
            <div class="cat-head">
              <strong>{{ c.category }}</strong>
              <label class="inline"><input type="checkbox" [checked]="!!c.pinned" (change)="togglePinned(i)" /> Pin to top</label>
              <button type="button" class="link danger-link" (click)="removeCategory(i)">Remove</button>
            </div>
            <div class="subs" *ngIf="subsOf(c.category).length">
              <label class="inline" *ngFor="let s of subsOf(c.category)">
                <input type="checkbox" [checked]="c.subs.includes(s)" (change)="toggleSub(i, s)" /> {{ s }}
              </label>
            </div>
            <small *ngIf="subsOf(c.category).length && !c.subs.length">No sub-category ticked: listed under &ldquo;{{ data!.taxonomy.otherName }}&rdquo;.</small>
          </div>
          <p class="problem" *ngIf="!draft.categories.length">At least one category is required.</p>
          <label>Add a category
            <select (change)="addCategory($any($event.target).value); $any($event.target).value = ''">
              <option value="">Choose&hellip;</option>
              <option *ngFor="let name of unusedCategories" [value]="name">{{ name }}</option>
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Related articles <small>(shown as cards under the article)</small></legend>
          <ol class="linked" *ngIf="draft.linked.length">
            <li *ngFor="let slug of draft.linked; let i = index">
              <span class="linked-title">{{ titleOf(slug) }} <small>{{ slug }}</small><em *ngIf="!exists(slug)"> (not found, ignored)</em></span>
              <button type="button" class="link" (click)="move(i, -1)" [disabled]="i === 0" aria-label="Move up">&uarr;</button>
              <button type="button" class="link" (click)="move(i, 1)" [disabled]="i === draft.linked.length - 1" aria-label="Move down">&darr;</button>
              <button type="button" class="link danger-link" (click)="removeLinked(i)">Remove</button>
            </li>
          </ol>
          <label>Search for an article to link
            <input type="search" placeholder="Type part of a title or slug&hellip;" [value]="query" (input)="search($any($event.target).value)" />
          </label>
          <ul class="results" *ngIf="results.length">
            <li *ngFor="let a of results">
              <button type="button" (click)="addLinked(a.slug)"><span>+</span> {{ a.title }} <small>{{ a.slug }}</small></button>
            </li>
          </ul>
          <small *ngIf="query.trim() && !results.length">No matching articles.</small>
        </fieldset>

        <fieldset>
          <legend>Notes for the maintainer <small>(optional)</small></legend>
          <textarea rows="2" [value]="notes" (input)="notes = $any($event.target).value"
            placeholder="Anything else, e.g. why a section or category should change"></textarea>
        </fieldset>

        <section class="errors" *ngIf="errors.length">
          <h3>Fix before submitting</h3>
          <p class="problem" *ngFor="let e of errors">{{ e }}</p>
        </section>

        <label class="inline ack" *ngIf="hasDanger">
          <input type="checkbox" [checked]="acknowledged" (change)="acknowledged = $any($event.target).checked" />
          I understand these changes may break existing links to this article or its topic pages.
        </label>

        <div class="actions">
          <button type="button" class="primary" (click)="submit()" [disabled]="!canSubmit">Submit as GitHub issue</button>
          <button type="button" (click)="copy()">{{ copied ? 'Copied' : 'Copy article.json' }}</button>
          <button type="button" (click)="reset()" [disabled]="!changes.length">Reset</button>
        </div>
        <p class="hint" *ngIf="!changes.length">No changes yet.</p>

        <details>
          <summary>Preview article.json ({{ changes.length }} change{{ changes.length === 1 ? '' : 's' }})</summary>
          <ul class="changes"><li *ngFor="let c of changes">{{ c }}</li></ul>
          <pre>{{ json }}</pre>
        </details>
      </form>
    </aside>
  `,
  styles: [`
    :host { display: contents; }
    .fab {
      position: fixed; right: 1rem; bottom: 1rem; z-index: 60; cursor: pointer;
      background: var(--accent); color: #111; border: 0; border-radius: 999px; padding: 0.6rem 1.1rem; font-weight: 600;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    }
    .drawer {
      position: fixed; top: 0; right: 0; bottom: 0; z-index: 55; width: min(480px, 100vw); overflow-y: auto;
      background: var(--surface); border-left: 1px solid var(--border); padding: 1.25rem 1.25rem 5rem; color: var(--text);
      box-shadow: -8px 0 24px rgba(0, 0, 0, 0.45);
    }
    h2 { font-size: 1.2rem; margin: 0 0 0.4rem; }
    h3 { font-size: 0.95rem; margin: 0 0 0.5rem; }
    .hint, small { color: var(--text-muted); font-size: 0.8rem; }
    fieldset { border: 1px solid var(--border); border-radius: var(--radius); margin: 1rem 0; padding: 0.75rem 0.9rem 0.9rem; }
    legend { padding: 0 0.4rem; font-weight: 600; font-size: 0.9rem; }
    label { display: block; margin-top: 0.6rem; font-size: 0.85rem; }
    label.inline { display: inline-flex; align-items: center; gap: 0.35rem; margin: 0 0.9rem 0.2rem 0; }
    input[type=text], input[type=search], textarea, select {
      display: block; width: 100%; margin-top: 0.25rem; padding: 0.45rem 0.6rem; font: inherit; color: var(--text);
      background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
    }
    input[readonly] { opacity: 0.6; }
    button { font: inherit; cursor: pointer; color: var(--text); background: var(--surface-raised); border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.8rem; }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    button.primary { background: var(--accent); color: #111; border-color: var(--accent); font-weight: 600; }
    button.link { background: none; border: 0; padding: 0.1rem 0.4rem; color: var(--accent-light); }
    button.danger-link { color: #ff6b6b; }
    .cat { border-top: 1px solid var(--border); padding: 0.6rem 0; }
    .cat:first-of-type { border-top: 0; }
    .cat-head { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; }
    .cat-head strong { flex: 1; }
    .subs { margin-top: 0.4rem; }
    .linked { margin: 0 0 0.5rem; padding-left: 1.2rem; }
    .linked li { display: flex; align-items: center; gap: 0.2rem; padding: 0.2rem 0; }
    .linked-title { flex: 1; font-size: 0.88rem; }
    .results { list-style: none; margin: 0.4rem 0 0; padding: 0; }
    .results button { width: 100%; text-align: left; margin-top: 0.25rem; }
    .results span { color: var(--accent-light); font-weight: 700; margin-right: 0.3rem; }
    .warn { margin: 0.4rem 0; padding: 0.55rem 0.7rem; border-radius: 6px; font-size: 0.85rem; border-left: 4px solid; }
    .warn.danger { background: rgba(229, 72, 77, 0.14); border-color: #e5484d; }
    .warn.caution { background: rgba(245, 165, 36, 0.14); border-color: #f5a524; }
    .warn.info { background: var(--accent-dim); border-color: var(--accent); }
    .problem { color: #ff8a8a; font-size: 0.85rem; margin: 0.25rem 0; }
    .ack { margin: 0.8rem 0; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem; }
    pre { overflow-x: auto; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem; font-size: 0.75rem; }
    details { margin-top: 1rem; }
    .changes { font-size: 0.82rem; }
    code { background: var(--bg); padding: 0 0.25rem; border-radius: 4px; }
  `],
})
export class ArticleEditorComponent implements OnInit {
  /** Slug of the article being viewed. */
  @Input({ required: true }) slug!: string;

  private content = inject(ContentService);
  private router = inject(Router);

  open = false;
  loadError = '';
  data?: EditorData;
  entry?: EditorEntry;
  meta!: ArticleMeta;
  manifest: ArticleSummary[] = [];
  nav: NavCategory[] = [];
  sections: string[] = [];

  draft!: Draft;
  errors: string[] = [];
  warnings: Warning[] = [];
  changes: string[] = [];
  json = '';
  hasDanger = false;
  acknowledged = false;
  notes = '';
  query = '';
  results: ArticleSummary[] = [];
  copied = false;
  private dangerKey = '';

  ngOnInit(): void {
    combineLatest([this.content.getEditorData(), this.content.getManifest(), this.content.getNavigation()]).subscribe({
      next: ([data, manifest, nav]) => {
        const entry = data.articles[this.slug];
        if (!entry) {
          this.loadError = `No editor data for "${this.slug}". Rebuild the content (npm run content).`;
          return;
        }
        this.data = data;
        this.entry = entry;
        this.meta = entry.meta;
        this.manifest = manifest;
        this.nav = nav;
        this.sections = [...new Set(manifest.map((a) => a.section).filter((s): s is string => !!s))].sort();
        this.reset();
      },
      error: () => (this.loadError = 'Could not load the editor data (editor.json).'),
    });
  }

  get canSubmit(): boolean {
    return !!this.entry && this.errors.length === 0 && this.changes.length > 0 && (!this.hasDanger || this.acknowledged);
  }

  get unusedCategories(): string[] {
    const used = new Set(this.draft.categories.map((c) => c.category));
    return (this.data?.taxonomy.categories ?? []).map((c) => c.name).filter((n) => !used.has(n));
  }

  subsOf(category: string): string[] {
    return this.data?.taxonomy.categories.find((c) => c.name === category)?.subs ?? [];
  }

  label(w: Warning): string {
    return w.severity === 'danger' ? 'May break links:' : w.severity === 'caution' ? 'Heads up:' : 'Note:';
  }

  titleOf(slug: string): string {
    return this.manifest.find((a) => a.slug === slug)?.title ?? slug;
  }

  exists(slug: string): boolean {
    return this.manifest.some((a) => a.slug === slug);
  }

  reset(): void {
    this.draft = draftFrom(this.meta);
    this.acknowledged = false;
    this.query = '';
    this.results = [];
    this.recompute();
  }

  set(field: 'title' | 'section' | 'date' | 'author' | 'excerpt', value: string): void {
    this.draft[field] = value;
    this.recompute();
  }

  addCategory(name: string): void {
    if (name && !this.draft.categories.some((c) => c.category === name)) {
      this.draft.categories.push({ category: name, subs: [] });
      this.recompute();
    }
  }

  removeCategory(i: number): void {
    this.draft.categories.splice(i, 1);
    this.recompute();
  }

  toggleSub(i: number, sub: string): void {
    const c = this.draft.categories[i];
    c.subs = c.subs.includes(sub) ? c.subs.filter((s) => s !== sub) : [...c.subs, sub];
    this.recompute();
  }

  togglePinned(i: number): void {
    const c = this.draft.categories[i];
    if (c.pinned) delete c.pinned;
    else c.pinned = true;
    this.recompute();
  }

  search(q: string): void {
    this.query = q;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    this.results = words.length
      ? this.manifest
          .filter((a) => a.slug !== this.slug && !this.draft.linked.includes(a.slug) && words.every((w) => (a.title + ' ' + a.slug).toLowerCase().includes(w)))
          .sort((a, b) => Number(b.title.toLowerCase().startsWith(words[0])) - Number(a.title.toLowerCase().startsWith(words[0])) || a.title.localeCompare(b.title))
          .slice(0, 8)
      : [];
  }

  addLinked(slug: string): void {
    if (!this.draft.linked.includes(slug)) this.draft.linked.push(slug);
    this.search(this.query);
    this.recompute();
  }

  removeLinked(i: number): void {
    this.draft.linked.splice(i, 1);
    this.search(this.query);
    this.recompute();
  }

  move(i: number, by: number): void {
    const j = i + by;
    if (j < 0 || j >= this.draft.linked.length) return;
    [this.draft.linked[i], this.draft.linked[j]] = [this.draft.linked[j], this.draft.linked[i]];
    this.recompute();
  }

  private recompute(): void {
    if (!this.data || !this.entry) return;
    const next = buildMeta(this.meta, this.draft);
    this.json = metaToJson(next);
    this.errors = validate(this.meta.slug, this.draft, this.data.taxonomy);
    this.warnings = impact(this.meta, this.draft, this.nav, this.data.taxonomy, this.entry);
    this.changes = describeChanges(this.meta, next);
    const danger = this.warnings.filter((w) => w.severity === 'danger').map((w) => w.text);
    this.hasDanger = danger.length > 0;
    // A new risk needs a fresh acknowledgement.
    if (danger.join('|') !== this.dangerKey) this.acknowledged = false;
    this.dangerKey = danger.join('|');
    this.copied = false;
  }

  async copy(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(this.json);
      this.copied = true;
      return true;
    } catch {
      return false;
    }
  }

  submit(): void {
    if (!this.canSubmit) return;
    const path = this.router.url.split(/[?#]/)[0];
    const { url, jsonInBody } = issueUrl({
      meta: this.meta,
      json: this.json,
      changes: this.changes,
      warnings: this.warnings,
      acknowledged: this.acknowledged,
      notes: this.notes,
      pageUrl: SITE_ORIGIN + path,
    });
    // Too long for the link: put the JSON on the clipboard so it can be pasted into the issue.
    if (!jsonInBody) void this.copy();
    window.open(url, '_blank', 'noopener');
  }
}
