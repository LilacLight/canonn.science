import { Component, HostListener, inject } from '@angular/core';
import { AsyncPipe, DatePipe, NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { ArticleSummary, ContentService, articleLink } from '../../services/content.service';
import { SECTION_LABELS } from '../analysis/analysis.model';
import { LAB_RULES, makeSuggester, topicString } from '../analysis/workbench.model';
import {
  Assignment,
  Category,
  Filter,
  SorterState,
  addCategory,
  addSub,
  applyLabel,
  countIn,
  deleteCategory,
  deleteSub,
  emptyState,
  exportState,
  findCategory,
  firstMatch,
  isSorted,
  matches,
  membersOf,
  moveSub,
  mergeStates,
  parseState,
  recentFirst,
  renameCategory,
  renameSub,
  skip,
  step,
  toggleCategory,
  toggleSub,
  withoutSub,
} from './sorter.model';

const STORE_KEY = 'canonn-sorter-v2';
const EXCERPT_CHARS = 700;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

@Component({
  selector: 'app-sorter',
  standalone: true,
  imports: [AsyncPipe, DatePipe, NgFor, NgIf, RouterLink],
  template: `
    <ng-container *ngIf="ready$ | async">
      <div class="container sorter">
        <nav class="breadcrumb"><a routerLink="/">Home</a> / <a routerLink="/analysis">Analysis</a> / Sorter</nav>
        <h1>Sort articles into categories</h1>

        <div class="progress" role="progressbar" [attr.aria-valuenow]="stats.sorted" [attr.aria-valuemax]="ordered.length">
          <div class="progress-fill" [style.width.%]="(stats.sorted / ordered.length) * 100"></div>
        </div>
        <p class="progress-text">
          {{ stats.sorted }} of {{ ordered.length }} sorted · {{ stats.skipped }} skipped ·
          {{ ordered.length - stats.sorted - stats.skipped }} to go
        </p>

        <div class="layout">
          <!-- Current article -->
          <section class="card" *ngIf="!noMatches && current as a">
            <p class="pos">
              <label>Show
                <select [value]="filter" (change)="setFilter($any($event.target).value)">
                  <option value="unsorted">unsorted</option>
                  <option value="skipped">skipped</option>
                  <option value="sorted">sorted</option>
                  <option value="all">all</option>
                </select>
              </label>
              <label class="kw">Contains
                <input type="search" placeholder="keyword(s) in title or content" autocomplete="off"
                  [value]="query" (input)="setQuery($any($event.target).value)" aria-label="Filter by keyword" />
              </label>
              <span *ngIf="!query">article {{ index + 1 }} of {{ ordered.length }}, newest first</span>
              <span *ngIf="query">{{ matchCount() }} matching, newest first</span>
            </p>

            <div class="head">
              <img *ngIf="a.banner_image" [src]="a.banner_image" alt="" class="thumb" />
              <div>
                <h2><a [routerLink]="link(a)" target="_blank" rel="noopener">{{ a.title }}</a></h2>
                <p class="meta">
                  <span *ngIf="a.date">{{ a.date | date: 'mediumDate' }} · </span>{{ sectionLabel(a) }}
                  <span *ngIf="a.categories.length"> · now filed under {{ topicNames(a) }}</span>
                </p>
              </div>
            </div>

            <p class="excerpt">{{ excerpt(a) }}</p>

            <div class="assigned" aria-live="polite">
              <span class="label">Filed as:</span>
              <span *ngFor="let x of assignmentsOf(a)" class="pill">
                {{ x.category }}<span *ngIf="x.subs?.length"> › {{ x.subs!.join(', ') }}</span>
                <button class="x" (click)="removeCategory(a, x.category)" [attr.aria-label]="'Remove ' + x.category">✕</button>
              </span>
              <span *ngIf="assignmentsOf(a).length === 0" class="none">nothing yet</span>
            </div>

            <p class="suggest" *ngIf="suggestionFor(a) as s">
              Suggested from the keywords: <strong>{{ s }}</strong>
              <button (click)="useSuggestion(a, s)">Use it</button>
            </p>

            <p class="note" *ngIf="note" aria-live="polite">{{ note }}</p>

            <div class="nav-buttons">
              <button (click)="go(-1)" [disabled]="!canGo(-1)">← Previous</button>
              <button (click)="skipCurrent()">Skip ↓</button>
              <button class="primary" (click)="go(1)" [disabled]="!canGo(1)">Next →</button>
            </div>
          </section>

          <section class="card empty" *ngIf="!current || noMatches">
            <label class="kw" *ngIf="query">Contains
              <input type="search" [value]="query" (input)="setQuery($any($event.target).value)" aria-label="Filter by keyword" />
            </label>
            <p>There are no articles to show with this filter.</p>
          </section>

          <!-- Categories -->
          <section class="card cats">
            <h3>Categories</h3>
            <label class="auto">
              <input type="checkbox" [checked]="autoAdvance" (change)="autoAdvance = $any($event.target).checked" />
              Move on automatically after filing
            </label>

            <form class="new" (submit)="addFromInput($event, nameInput)">
              <input #nameInput type="text" placeholder="New category, or Category > Sub-category" aria-label="New category" autocomplete="off" />
              <button>Add &amp; file</button>
            </form>

            <p class="none" *ngIf="state.categories.length === 0">
              No categories yet. Type one above, or
              <button class="link" (click)="seedLabs()">start with the Canonn labs</button>.
            </p>

            <div
              class="cat"
              *ngFor="let c of state.categories; let i = index"
              [class.active]="c.name === active"
              [class.drop]="dragOver === c.name"
              (dragover)="onDragOver($event, c)"
              (dragleave)="dragOver = null"
              (drop)="onDrop($event, c)"
            >
              <div class="cat-head">
                <button
                  class="cat-btn"
                  [class.on]="has(c.name)"
                  [attr.aria-pressed]="has(c.name)"
                  (click)="pickCategory(c)"
                >
                  <kbd *ngIf="i < 9">{{ i + 1 }}</kbd>
                  <span class="cat-name">{{ c.name }}</span>
                  <span class="cat-count">{{ count(c.name) }}</span>
                </button>
              </div>
              <div class="subs">
                <button
                  *ngFor="let s of c.subs; let j = index"
                  class="sub"
                  draggable="true"
                  (dragstart)="onDragStart($event, c, s)"
                  (dragend)="drag = null; dragOver = null"
                  [class.on]="subsOf(c.name).includes(s)"
                  [attr.aria-pressed]="subsOf(c.name).includes(s)"
                  (click)="pickSub(c, s)"
                >
                  <kbd *ngIf="c.name === active && j < 26">{{ letter(j) }}</kbd>{{ s }}
                  <span class="cat-count">{{ count(c.name, s) }}</span>
                </button>
                <input
                  type="text"
                  class="sub-new"
                  placeholder="+ sub-category"
                  [attr.aria-label]="'New sub-category of ' + c.name"
                  autocomplete="off"
                  (keydown.enter)="addSubFromInput(c, $any($event.target))"
                />
              </div>
            </div>

            <p class="hint">
              Keys: <kbd>1</kbd>–<kbd>9</kbd> pick a category, <kbd>a</kbd>–<kbd>z</kbd> pick a sub-category of the
              highlighted one, <kbd>→</kbd> or <kbd>Enter</kbd> next, <kbd>←</kbd> previous, <kbd>↓</kbd> skip.
            </p>
          </section>
        </div>

        <!-- Up next -->
        <section class="block" *ngIf="upcoming().length">
          <h3>Up next</h3>
          <ul class="queue">
            <li *ngFor="let u of upcoming()"><button class="link" (click)="jump(u.i)">{{ u.a.title }}</button>
              <small *ngIf="u.a.date">{{ u.a.date | date: 'mediumDate' }}</small></li>
          </ul>
        </section>

        <!-- Review -->
        <section class="block">
          <h3>Review what you've filed</h3>
          <div class="review-pick" *ngIf="state.categories.length; else nocats">
            <label>Category
              <select [value]="reviewCat" (change)="setReview($any($event.target).value)">
                <option value="">choose…</option>
                <option *ngFor="let c of state.categories" [value]="c.name">{{ c.name }} ({{ count(c.name) }})</option>
              </select>
            </label>
            <label *ngIf="reviewCat && reviewSubs().length">Sub-category
              <select [value]="reviewSub" (change)="reviewSub = $any($event.target).value">
                <option value="">all ({{ count(reviewCat) }})</option>
                <option *ngFor="let s of reviewSubs()" [value]="s">{{ s }} ({{ count(reviewCat, s) }})</option>
                <option value="\u0000none">no sub-category ({{ noSubCount() }})</option>
              </select>
            </label>
          </div>
          <ng-template #nocats><p class="none">Nothing to review yet.</p></ng-template>
          <ul class="members" *ngIf="reviewCat">
            <li *ngFor="let a of reviewMembers()">
              <a [routerLink]="link(a)" target="_blank" rel="noopener">{{ a.title }}</a>
              <small *ngIf="subLabel(a)"> › {{ subLabel(a) }}</small>
              <button class="x" (click)="removeCategory(a, reviewCat)" [attr.aria-label]="'Remove ' + a.title + ' from ' + reviewCat">✕</button>
            </li>
          </ul>
        </section>

        <!-- Manage -->
        <details class="block">
          <summary>Rename or delete categories</summary>
          <div class="manage" *ngFor="let c of state.categories">
            <div class="row">
              <input type="text" [value]="c.name" (change)="rename(c, $any($event.target))" [attr.aria-label]="'Rename ' + c.name" />
              <button (click)="removeWholeCategory(c)">Delete</button>
            </div>
            <div class="row sub-row" *ngFor="let s of c.subs">
              <input type="text" [value]="s" (change)="renameSubOf(c, s, $any($event.target))" [attr.aria-label]="'Rename ' + s" />
              <select [attr.aria-label]="'Move ' + s + ' to another category'" (change)="moveTo(c, s, $any($event.target))">
                <option value="">Move to…</option>
                <option *ngFor="let o of state.categories" [value]="o.name" [hidden]="o.name === c.name">{{ o.name }}</option>
              </select>
              <button (click)="removeSub(c, s)">Delete</button>
            </div>
          </div>
          <p class="none" *ngIf="!state.categories.length">No categories yet.</p>
        </details>

        <!-- Export -->
        <section class="block export">
          <h3>Take it away</h3>
          <p class="hint">
            Your work is saved in this browser only. Download it to keep a copy or hand it to whoever updates the
            articles; each article is listed with its category and sub-category.
          </p>
          <div class="buttons">
            <button class="primary" (click)="download()" [disabled]="stats.sorted === 0">Download (JSON)</button>
            <label class="file">Import a downloaded file
              <input type="file" accept="application/json,.json" (change)="importFile($any($event.target))" />
            </label>
            <button (click)="seedLabs()">Add the Canonn labs</button>
            <button (click)="resetAll()" [disabled]="!state.categories.length && stats.sorted === 0">Start again</button>
          </div>
          <p class="note" *ngIf="note" aria-live="polite">{{ note }}</p>
        </section>
      </div>
    </ng-container>
  `,
  styles: [`
    .sorter { padding: 2rem 1.5rem 5rem; max-width: 1100px; }
    .breadcrumb { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.75rem; }
    h1 { font-size: 1.8rem; }
    h2 { font-size: 1.25rem; margin: 0; }
    h3 { font-size: 1rem; margin: 0 0 0.6rem; }
    small, .meta, .hint, .none { color: var(--text-muted); font-size: 0.82rem; }
    kbd { font: inherit; font-size: 0.72rem; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 0 0.3rem; margin-right: 0.35rem; color: var(--text-muted); }

    button { font: inherit; color: var(--text); background: var(--surface-raised); border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.85rem; cursor: pointer; }
    button:hover:not(:disabled) { border-color: var(--accent); }
    button:disabled { opacity: 0.4; cursor: default; }
    button.primary { background: var(--accent-dim); border-color: var(--accent); color: var(--accent-light); }
    button.link { background: none; border: 0; padding: 0; color: var(--accent-light); text-decoration: underline; text-align: left; }
    button.x { padding: 0 0.35rem; margin-left: 0.3rem; border: 0; background: transparent; color: var(--text-muted); }
    input[type=text], select { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.6rem; min-width: 0; }

    .progress { height: 8px; background: var(--surface); border-radius: 4px; overflow: hidden; margin-top: 0.75rem; }
    .progress-fill { height: 100%; background: #3987e5; }
    .progress-text { color: var(--text-muted); font-size: 0.85rem; margin: 0.4rem 0 1.25rem; }

    .layout { display: grid; grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr); gap: 1.25rem; align-items: start; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.1rem; }
    .pos { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.8rem; }
    .head { display: flex; gap: 0.9rem; align-items: flex-start; }
    .thumb { width: 110px; height: 70px; object-fit: cover; border-radius: 6px; flex: none; }
    .excerpt { margin: 0.9rem 0; font-size: 0.9rem; color: var(--text-muted); max-height: 11rem; overflow-y: auto; }
    .assigned { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-bottom: 0.7rem; font-size: 0.85rem; }
    .label { color: var(--text-muted); }
    .pill { background: var(--accent-dim); border: 1px solid var(--border); border-radius: 999px; padding: 0.1rem 0.3rem 0.1rem 0.7rem; color: var(--accent-light); }
    .suggest { font-size: 0.85rem; margin: 0 0 0.8rem; }
    .suggest button { margin-left: 0.5rem; padding: 0.15rem 0.6rem; }
    .nav-buttons { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .empty { text-align: center; color: var(--text-muted); }
    .kw { display: flex; gap: 0.4rem; align-items: center; }
    .kw input { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.3rem 0.6rem; min-width: 0; width: 14rem; }

    .auto { display: flex; gap: 0.5rem; align-items: center; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.7rem; }
    .new { display: flex; gap: 0.4rem; margin-bottom: 0.9rem; }
    .new input { flex: 1; }
    .cat { border-top: 1px solid var(--border); padding: 0.55rem 0; }
    .cat.active { background: rgba(57, 135, 229, 0.07); margin: 0 -0.5rem; padding: 0.55rem 0.5rem; border-radius: 6px; }
    .cat-btn { display: flex; align-items: center; width: 100%; text-align: left; }
    .cat-btn.on, .sub.on { background: var(--accent-dim); border-color: var(--accent); color: var(--accent-light); }
    .cat-name { flex: 1; }
    .cat-count { color: var(--text-muted); font-size: 0.78rem; margin-left: 0.4rem; font-variant-numeric: tabular-nums; }
    .subs { display: flex; flex-wrap: wrap; gap: 0.35rem; margin: 0.45rem 0 0 1.2rem; align-items: center; }
    .sub { padding: 0.2rem 0.6rem; font-size: 0.82rem; border-radius: 999px; }
    .sub[draggable="true"] { cursor: grab; }
    .cat.drop { outline: 2px dashed var(--accent); outline-offset: -2px; background: var(--accent-dim); }
    .sub-new { width: 9rem; font-size: 0.8rem; padding: 0.2rem 0.5rem; }

    .block { margin-top: 2rem; }
    .queue, .members { list-style: none; padding: 0; margin: 0; font-size: 0.88rem; columns: 2 280px; }
    .queue li, .members li { padding: 0.15rem 0; break-inside: avoid; }
    .queue small { margin-left: 0.5rem; }
    .review-pick { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.8rem; font-size: 0.85rem; color: var(--text-muted); }
    .review-pick select { margin-left: 0.4rem; }

    details summary { cursor: pointer; font-weight: 600; margin-bottom: 0.6rem; }
    .manage { border-top: 1px solid var(--border); padding: 0.5rem 0; }
    .row { display: flex; gap: 0.4rem; margin-bottom: 0.3rem; }
    .row input { flex: 1; }
    .sub-row { margin-left: 1.5rem; }

    .buttons { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
    .file { position: relative; cursor: pointer; background: var(--surface-raised); border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.85rem; font-size: 0.95rem; }
    .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .note { margin-top: 0.7rem; font-size: 0.85rem; }

    @media (max-width: 800px) { .layout { grid-template-columns: 1fr; } }
  `],
})
export class SorterComponent {
  private content = inject(ContentService);

  ordered: ArticleSummary[] = [];
  state: SorterState = emptyState();
  index = 0;
  filter: Filter = 'unsorted';
  autoAdvance = false;
  active: string | null = null;
  reviewCat = '';
  reviewSub = '';
  note = '';
  stats = { sorted: 0, skipped: 0 };

  /** Articles visited, so Previous returns to them even once they are filed. */
  private history: number[] = [];
  private text = new Map<string, string>();
  private haystack = new Map<string, string>();
  private words: string[] = [];
  query = '';
  private suggestions = new Map<string, string | null>();
  private suggester = makeSuggester(LAB_RULES);

  get current(): ArticleSummary | null {
    return this.ordered[this.index] ?? null;
  }

  ready$: Observable<boolean> = combineLatest([this.content.getManifest(), this.content.getSearchIndex()]).pipe(
    map(([manifest, search]) => {
      this.ordered = recentFirst(manifest);
      this.text = new Map(search.map((e) => [e.slug, e.text]));
      const titles = new Map(manifest.map((a) => [a.slug, a.title]));
      this.haystack = new Map(
        manifest.map((a) => [a.slug, `${titles.get(a.slug) ?? ''}\n${this.text.get(a.slug) ?? ''}`.toLowerCase()]),
      );
      this.restore();
      this.index = firstMatch(this.ordered, (s) => matches(this.filter, this.state, s));
      this.refresh();
      return true;
    }),
  );

  // --- keyboard ----------------------------------------------------------

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const el = e.target as HTMLElement | null;
    if (e.ctrlKey || e.metaKey || e.altKey || !this.current || el?.closest('input, textarea, select')) {
      return;
    }
    const key = e.key;
    const onControl = !!el?.closest('button, a');
    if (key >= '1' && key <= '9') {
      const c = this.state.categories[Number(key) - 1];
      if (c) {
        e.preventDefault();
        this.pickCategory(c);
      }
    } else if (key.length === 1 && LETTERS.includes(key.toLowerCase()) && this.active) {
      const cat = findCategory(this.state, this.active);
      const sub = cat?.subs[LETTERS.indexOf(key.toLowerCase())];
      if (cat && sub) {
        e.preventDefault();
        this.pickSub(cat, sub);
      }
    } else if (key === 'ArrowRight' || (key === 'Enter' && !onControl)) {
      e.preventDefault();
      this.go(1);
    } else if (key === 'ArrowLeft') {
      e.preventDefault();
      this.go(-1);
    } else if (key === 'ArrowDown') {
      e.preventDefault();
      this.skipCurrent();
    }
  }

  // --- navigation ----------------------------------------------------------

  private pred = (slug: string) => matches(this.filter, this.state, slug) && this.hasWords(slug);

  /** True when the title or content contains every word typed in the keyword box. */
  private hasWords(slug: string): boolean {
    if (!this.words.length) {
      return true;
    }
    const hay = this.haystack.get(slug) ?? '';
    return this.words.every((w) => hay.includes(w));
  }

  /** A keyword search that finds nothing (the filter alone keeps the old behaviour). */
  get noMatches(): boolean {
    return this.words.length > 0 && !this.ordered.some((a) => this.pred(a.slug));
  }

  setQuery(value: string): void {
    this.query = value;
    this.words = value.toLowerCase().split(/\s+/).filter(Boolean);
    this.history = [];
    this.index = firstMatch(this.ordered, this.pred);
  }

  /** Number of articles that pass the current filter and keywords. */
  matchCount(): number {
    return this.ordered.filter((a) => this.pred(a.slug)).length;
  }

  canGo(dir: 1 | -1): boolean {
    return (dir === -1 && this.history.length > 0) || step(this.ordered, this.index, dir, this.pred) !== this.index;
  }

  go(dir: 1 | -1): void {
    if (dir === -1 && this.history.length) {
      this.index = this.history.pop()!;
    } else {
      const next = step(this.ordered, this.index, dir, this.pred);
      if (next !== this.index) {
        if (dir === 1) {
          this.remember();
        }
        this.index = next;
      }
    }
    this.note = '';
  }

  jump(i: number): void {
    this.remember();
    this.index = i;
    this.note = '';
  }

  setFilter(value: Filter): void {
    this.filter = value;
    this.history = [];
    this.index = firstMatch(this.ordered, this.pred);
  }

  private remember(): void {
    this.history.push(this.index);
    if (this.history.length > 200) {
      this.history.shift();
    }
  }

  upcoming(): { a: ArticleSummary; i: number }[] {
    const out: { a: ArticleSummary; i: number }[] = [];
    for (let i = this.index + 1; i < this.ordered.length && out.length < 12; i++) {
      if (this.pred(this.ordered[i].slug)) {
        out.push({ a: this.ordered[i], i });
      }
    }
    return out;
  }

  skipCurrent(): void {
    if (this.current) {
      skip(this.state, this.current.slug);
      this.changed();
      this.go(1);
    }
  }

  // --- filing -----------------------------------------------------------------

  private advanceIfAuto(): void {
    if (this.autoAdvance) {
      this.go(1);
    }
  }

  has(category: string): boolean {
    return !!this.current && (this.state.assign[this.current.slug] ?? []).some((a) => a.category === category);
  }

  subsOf(category: string): string[] {
    return this.current ? ((this.state.assign[this.current.slug] ?? []).find((a) => a.category === category)?.subs ?? []) : [];
  }

  assignmentsOf(a: ArticleSummary): Assignment[] {
    return this.state.assign[a.slug] ?? [];
  }

  pickCategory(c: Category): void {
    if (!this.current) {
      return;
    }
    const added = toggleCategory(this.state, this.current.slug, c.name);
    this.active = added ? c.name : this.active === c.name ? null : this.active;
    this.changed();
    // Categories with sub-categories wait for a choice; the rest move on.
    if (added && c.subs.length === 0) {
      this.advanceIfAuto();
    }
  }

  pickSub(c: Category, sub: string): void {
    if (!this.current) {
      return;
    }
    const set = toggleSub(this.state, this.current.slug, c.name, sub);
    this.active = c.name;
    this.changed();
    if (set) {
      this.advanceIfAuto();
    }
  }

  removeCategory(a: ArticleSummary, category: string): void {
    if (this.has(category) || (this.state.assign[a.slug] ?? []).some((x) => x.category === category)) {
      toggleCategory(this.state, a.slug, category);
      this.changed();
    }
  }

  addFromInput(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    if (!this.current || !input.value.trim()) {
      return;
    }
    const isNew = !findCategory(this.state, input.value.split('>')[0]);
    const label = applyLabel(this.state, this.current.slug, input.value);
    input.value = '';
    if (!label) {
      return;
    }
    this.active = label.category;
    this.changed();
    const cat = findCategory(this.state, label.category);
    if (isNew && !label.sub) {
      // A brand-new category stays on this article so a sub-category can be added.
      this.note = `Filed under "${label.category}". Add a sub-category in the box below it, or press → to move on.`;
    } else if (label.sub || (cat && cat.subs.length === 0)) {
      this.advanceIfAuto();
    }
  }

  addSubFromInput(c: Category, input: HTMLInputElement): void {
    const sub = addSub(this.state, c.name, input.value);
    input.value = '';
    if (sub && this.current) {
      this.pickSub(c, sub);
    } else {
      this.changed();
    }
  }

  suggestionFor(a: ArticleSummary): string | null {
    let s = this.suggestions.get(a.slug);
    if (s === undefined) {
      s = this.suggester(a.title, this.text.get(a.slug) ?? '', topicString(a));
      this.suggestions.set(a.slug, s);
    }
    return s && !this.has(s) ? s : null;
  }

  useSuggestion(a: ArticleSummary, name: string): void {
    const label = applyLabel(this.state, a.slug, name);
    if (label) {
      this.active = label.category;
      this.changed();
      const cat = findCategory(this.state, label.category);
      if (cat && cat.subs.length === 0) {
        this.advanceIfAuto();
      }
    }
  }

  seedLabs(): void {
    const names = [...new Set(LAB_RULES.map((r) => r.name))];
    names.forEach((n) => addCategory(this.state, n));
    this.changed();
    this.note = `Added ${names.length} categories from the Canonn labs.`;
  }

  // --- managing ---------------------------------------------------------------

  rename(c: Category, input: HTMLInputElement): void {
    const name = renameCategory(this.state, c.name, input.value);
    if (this.active === c.name) {
      this.active = name;
    }
    if (this.reviewCat === c.name) {
      this.reviewCat = name;
    }
    this.changed();
  }

  renameSubOf(c: Category, sub: string, input: HTMLInputElement): void {
    renameSub(this.state, c.name, sub, input.value);
    this.reviewSub = '';
    this.changed();
  }

  removeWholeCategory(c: Category): void {
    const n = countIn(this.state, c.name);
    if (n === 0 || confirm(`Delete "${c.name}"? ${n} article${n === 1 ? ' is' : 's are'} filed under it and will lose it.`)) {
      deleteCategory(this.state, c.name);
      if (this.active === c.name) {
        this.active = null;
      }
      if (this.reviewCat === c.name) {
        this.reviewCat = '';
      }
      this.changed();
    }
  }

  // Drag a sub-category onto another category to move it, with its articles.
  drag: { category: string; sub: string } | null = null;
  dragOver: string | null = null;

  onDragStart(e: DragEvent, c: Category, sub: string): void {
    this.drag = { category: c.name, sub };
    e.dataTransfer?.setData('text/plain', `${c.name} > ${sub}`);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(e: DragEvent, c: Category): void {
    if (this.drag && this.drag.category !== c.name) {
      e.preventDefault();
      this.dragOver = c.name;
    }
  }

  onDrop(e: DragEvent, c: Category): void {
    e.preventDefault();
    const d = this.drag;
    this.drag = this.dragOver = null;
    if (d && d.category !== c.name) {
      this.move(d.category, d.sub, c.name);
    }
  }

  moveTo(c: Category, sub: string, select: HTMLSelectElement): void {
    const to = select.value;
    select.value = '';
    if (to) {
      this.move(c.name, sub, to);
    }
  }

  private move(from: string, sub: string, to: string): void {
    const n = countIn(this.state, from, sub);
    if (moveSub(this.state, from, sub, to)) {
      this.note = `Moved "${sub}" (${n} article${n === 1 ? '' : 's'}) from "${from}" to "${to}".`;
      this.changed();
    }
  }

  removeSub(c: Category, sub: string): void {
    const n = countIn(this.state, c.name, sub);
    if (n === 0 || confirm(`Delete "${sub}"? ${n} article${n === 1 ? '' : 's'} will stay in "${c.name}" without a sub-category.`)) {
      deleteSub(this.state, c.name, sub);
      this.reviewSub = '';
      this.changed();
    }
  }

  // --- review --------------------------------------------------------------------

  setReview(name: string): void {
    this.reviewCat = name;
    this.reviewSub = '';
  }

  reviewSubs(): string[] {
    return findCategory(this.state, this.reviewCat)?.subs ?? [];
  }

  noSubCount(): number {
    return withoutSub(this.state, this.reviewCat).length;
  }

  reviewMembers(): ArticleSummary[] {
    const bySlug = new Map(this.ordered.map((a) => [a.slug, a]));
    let slugs: string[];
    if (this.reviewSub === '\u0000none') {
      slugs = withoutSub(this.state, this.reviewCat);
    } else {
      slugs = membersOf(this.state, this.reviewCat, this.reviewSub || undefined);
    }
    return slugs
      .map((s) => bySlug.get(s))
      .filter((a): a is ArticleSummary => !!a)
      .sort((x, y) => this.ordered.indexOf(x) - this.ordered.indexOf(y));
  }

  subLabel(a: ArticleSummary): string {
    return (this.state.assign[a.slug] ?? []).find((x) => x.category === this.reviewCat)?.subs?.join(', ') ?? '';
  }

  // --- display helpers ---------------------------------------------------------

  count(category: string, sub?: string): number {
    return countIn(this.state, category, sub);
  }

  letter(i: number): string {
    return LETTERS[i];
  }

  link(a: ArticleSummary): string[] {
    return articleLink(a);
  }

  sectionLabel(a: ArticleSummary): string {
    return SECTION_LABELS[a.section ?? 'uncategorised'] ?? a.section ?? '';
  }

  topicNames(a: ArticleSummary): string {
    return a.categories.map((c) => c.name).join(', ');
  }

  excerpt(a: ArticleSummary): string {
    const t = this.text.get(a.slug) ?? '';
    return t.length > EXCERPT_CHARS ? `${t.slice(0, EXCERPT_CHARS).trimEnd()}…` : t;
  }

  // --- saving, export, import ------------------------------------------------------

  private changed(): void {
    this.suggestions.clear();
    this.refresh();
    this.persist();
  }

  private refresh(): void {
    this.stats = {
      sorted: this.ordered.filter((a) => isSorted(this.state, a.slug)).length,
      skipped: this.ordered.filter((a) => matches('skipped', this.state, a.slug)).length,
    };
  }

  private restore(): void {
    try {
      const saved = parseState(JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null'));
      if (saved) {
        this.state = saved;
      }
    } catch {
      /* storage unavailable or corrupt: start empty */
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
    } catch {
      this.note = 'Could not save in this browser, so download your work before leaving the page.';
    }
  }

  download(): void {
    const url = URL.createObjectURL(new Blob([JSON.stringify(exportState(this.state), null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'canonn-sorted-articles.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    try {
      const incoming = parseState(JSON.parse(await file.text()));
      if (!incoming) {
        this.note = 'That file does not look like a download from this tool.';
        return;
      }
      this.state = mergeStates(this.state, incoming);
      this.changed();
      this.note = `Imported. You now have ${this.stats.sorted} articles sorted.`;
    } catch {
      this.note = 'That file could not be read.';
    }
  }

  resetAll(): void {
    if (confirm('Throw away all categories and everything you have filed? This cannot be undone.')) {
      this.state = emptyState();
      this.active = null;
      this.reviewCat = '';
      this.history = [];
      this.index = firstMatch(this.ordered, this.pred);
      this.changed();
      this.note = 'Cleared.';
    }
  }
}
