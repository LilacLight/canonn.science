import { Component, inject } from '@angular/core';
import { AsyncPipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { ArticleSummary, ContentService, articleLink } from '../../services/content.service';
import { SECTION_LABELS, classifyType } from './analysis.model';
import {
  DEFAULT_RULES,
  KeywordRule,
  LAB_RULES,
  PROPOSED_MERGES,
  Result,
  alsoIn,
  compileRule,
  evaluate,
  regionsOf,
  topicString,
} from './workbench.model';

type SchemeKey = 'topics' | 'sections' | 'type' | 'region' | 'merge' | 'rules';

interface Scheme {
  key: SchemeKey;
  label: string;
  desc: string;
}

interface TopicRow {
  slug: string;
  name: string;
  /** Display name; the slug is added when two topics share a name. */
  label: string;
  count: number;
}

const STORE_KEY = 'canonn-analysis-workbench-v1';

const SCHEMES: Scheme[] = [
  { key: 'topics', label: 'Current topics', desc: 'The 20 topics as they are today. An article can have several.' },
  { key: 'sections', label: 'URL sections', desc: 'The first part of the original URL: codex, news, lab69xia and so on. One per article.' },
  { key: 'type', label: 'Content type', desc: 'The title-keyword rules from section 3, applied to every article. Articles that match no rule are unassigned.' },
  { key: 'region', label: 'Region', desc: 'Sector names written in the article text (Pleiades Sector, Col 285 Sector...). Articles that name none are unassigned.' },
  { key: 'merge', label: 'Merge topics', desc: 'Edit the table: give topics the same group name to merge them. Start from the merges suggested in section 6.' },
  { key: 'rules', label: 'My keyword rules', desc: 'Define your own categories by keywords in titles, bodies, or both. Words match at the start of a word, and rules are tried in order.' },
];

@Component({
  selector: 'app-workbench',
  standalone: true,
  imports: [AsyncPipe, DecimalPipe, NgFor, NgIf, RouterLink],
  template: `
    <ng-container *ngIf="ready$ | async">
      <div class="tabs" role="tablist" aria-label="Grouping scheme">
        <button
          *ngFor="let s of schemes"
          role="tab"
          [attr.aria-selected]="s.key === scheme"
          [class.on]="s.key === scheme"
          (click)="setScheme(s.key)"
        >{{ s.label }}</button>
      </div>
      <p class="desc">{{ current.desc }}</p>
      <label class="once">
        <input type="checkbox" [checked]="once" (change)="setOnce($any($event.target).checked)" />
        Count each article once (first match only)
      </label>

      <!-- Merge editor -->
      <div class="editor" *ngIf="scheme === 'merge'">
        <div class="editor-actions">
          <button (click)="loadProposal()">Load suggested merges</button>
          <button (click)="resetMerge()">Reset to current topics</button>
        </div>
        <table class="merge">
          <thead><tr><th>Topic</th><th>Articles</th><th>Group name</th></tr></thead>
          <tbody>
            <tr *ngFor="let t of topicRows">
              <td>{{ t.label }}</td>
              <td>{{ t.count }}</td>
              <td>
                <input
                  type="text"
                  [value]="merge[t.slug] || t.label"
                  (input)="setMerge(t, $any($event.target).value)"
                  [attr.aria-label]="'Group for ' + t.label"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Rule editor -->
      <div class="editor" *ngIf="scheme === 'rules'">
        <div class="rule" *ngFor="let r of rules; let i = index">
          <input type="text" class="r-name" placeholder="Category name" [value]="r.name" (input)="editRule(i, 'name', $any($event.target).value)" aria-label="Category name" />
          <input type="text" class="r-words" placeholder="keywords, comma separated" [value]="r.keywords" (input)="editRule(i, 'keywords', $any($event.target).value)" aria-label="Keywords" />
          <select [value]="r.scope" (change)="editRule(i, 'scope', $any($event.target).value)" aria-label="Where to look">
            <option value="title">in title</option>
            <option value="body">in body</option>
            <option value="both">title or body</option>
            <option value="topic">in topic / section</option>
          </select>
          <input type="number" min="1" class="r-min" *ngIf="r.scope === 'body' || r.scope === 'both'" [value]="r.min ?? 1" (input)="editRule(i, 'min', $any($event.target).value)" title="Minimum mentions in the body" aria-label="Minimum mentions" />
          <button (click)="moveRule(i, -1)" [disabled]="i === 0" aria-label="Move up">↑</button>
          <button (click)="moveRule(i, 1)" [disabled]="i === rules.length - 1" aria-label="Move down">↓</button>
          <button (click)="removeRule(i)" aria-label="Remove rule">✕</button>
        </div>
        <div class="editor-actions">
          <button (click)="addRule()">Add a rule</button>
          <button (click)="loadLabs()">Load Canonn labs preset</button>
          <button (click)="resetRules()">Reset to examples</button>
        </div>
      </div>

      <!-- Metrics -->
      <div class="metrics">
        <div><strong>{{ result.metrics.groups }}</strong><span>groups</span></div>
        <div>
          <strong>{{ result.metrics.largest ? (result.metrics.largest.share | number: '1.0-0') + '%' : '–' }}</strong>
          <span>in the largest ({{ result.metrics.largest?.name ?? 'none' }})</span>
        </div>
        <div><strong>{{ result.metrics.effective | number: '1.1-1' }}</strong><span>equal groups it behaves like</span></div>
        <div><strong>{{ result.metrics.unassigned }}</strong><span>unassigned</span></div>
        <div><strong>{{ result.metrics.multi }}</strong><span>in more than one group</span></div>
        <div><strong>{{ result.metrics.small }}</strong><span>groups under 5 articles</span></div>
      </div>

      <!-- Groups -->
      <ul class="groups">
        <li *ngFor="let g of result.groups" [class.sel]="g.name === selected">
          <button (click)="select(g.name)" [attr.aria-expanded]="g.name === selected">
            <span class="g-name">{{ g.name }}</span>
            <span class="track"><span class="fill" [style.width.%]="(g.slugs.length / maxSize) * 100"></span></span>
            <span class="g-count">{{ g.slugs.length }}</span>
          </button>
        </li>
        <li *ngIf="result.unassigned.length" [class.sel]="selected === UNASSIGNED" class="un">
          <button (click)="select(UNASSIGNED)" [attr.aria-expanded]="selected === UNASSIGNED">
            <span class="g-name">Unassigned</span>
            <span class="track"><span class="fill grey" [style.width.%]="(result.unassigned.length / maxSize) * 100"></span></span>
            <span class="g-count">{{ result.unassigned.length }}</span>
          </button>
        </li>
      </ul>

      <div class="detail" *ngIf="selected !== null">
        <h3>{{ selected === UNASSIGNED ? 'Unassigned' : selected }} <small>{{ members().length }} articles</small></h3>
        <p class="also" *ngIf="selected !== UNASSIGNED && also().length">
          Also in:
          <span *ngFor="let o of also()"><button class="link" (click)="select(o.name)">{{ o.name }}</button> ({{ o.count }}) </span>
        </p>
        <ul class="members">
          <li *ngFor="let a of members()"><a [routerLink]="link(a)">{{ a.title }}</a></li>
        </ul>
      </div>

      <div class="export">
        <button (click)="downloadAssignments()">Download this grouping (JSON)</button>
        <button (click)="copyConfig()" *ngIf="scheme === 'merge' || scheme === 'rules'">Copy settings</button>
        <small *ngIf="note">{{ note }}</small>
      </div>
    </ng-container>
  `,
  styles: [`
    .tabs { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 1rem 0 0.5rem; }
    button { font: inherit; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.35rem 0.8rem; cursor: pointer; }
    button:hover:not(:disabled) { border-color: var(--accent); }
    button:disabled { opacity: 0.4; cursor: default; }
    .tabs button.on { background: var(--accent-dim); border-color: var(--accent); color: var(--accent-light); }
    .desc { color: var(--text-muted); font-size: 0.88rem; max-width: 70ch; margin-bottom: 0.5rem; }
    .once { display: inline-flex; gap: 0.5rem; align-items: center; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem; }

    .editor { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.8rem; margin: 0.5rem 0 1rem; }
    .editor-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.5rem 0; }
    input[type=text], select { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.3rem 0.5rem; min-width: 0; }
    .merge { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .merge th { text-align: left; color: var(--text-muted); font-weight: 500; padding: 0.2rem 0.5rem; }
    .merge td { padding: 0.2rem 0.5rem; }
    .merge td:nth-child(2) { color: var(--text-muted); text-align: right; width: 5rem; }
    .merge input { width: 100%; }
    .rule { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem; align-items: center; }
    .r-name { flex: 1 1 140px; }
    .r-words { flex: 3 1 240px; }
    .r-min { width: 4rem; }

    .metrics { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 0.5rem 0 1rem; }
    .metrics div { flex: 1 1 130px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.6rem 0.8rem; display: flex; flex-direction: column; }
    .metrics strong { font-family: var(--font-display); font-size: 1.4rem; line-height: 1.15; }
    .metrics span { color: var(--text-muted); font-size: 0.75rem; }

    .groups { list-style: none; padding: 0; margin: 0; }
    .groups li button { display: grid; grid-template-columns: minmax(150px, 17rem) 1fr 3rem; gap: 0.75rem; align-items: center; width: 100%; border: 0; background: transparent; border-radius: 0; padding: 0.3rem 0.4rem; text-align: left; font-size: 0.86rem; }
    .groups li button:hover { background: var(--surface); }
    .groups li.sel button { background: var(--accent-dim); }
    .g-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .track { height: 10px; background: var(--surface); border-radius: 0 3px 3px 0; }
    .fill { display: block; height: 100%; background: #3987e5; border-radius: 0 3px 3px 0; min-width: 2px; }
    .fill.grey { background: #5b6575; }
    .g-count { text-align: right; color: var(--text-muted); font-variant-numeric: tabular-nums; }

    .detail { margin-top: 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.8rem 1rem; }
    .detail h3 { font-size: 1rem; margin: 0 0 0.4rem; }
    small { color: var(--text-muted); font-size: 0.78rem; font-weight: 400; }
    .also { font-size: 0.83rem; color: var(--text-muted); }
    button.link { background: none; border: 0; padding: 0; color: var(--accent-light); text-decoration: underline; }
    .members { columns: 2 240px; list-style: none; padding: 0; margin: 0.5rem 0 0; font-size: 0.84rem; max-height: 22rem; overflow-y: auto; }
    .members li { padding: 0.1rem 0; break-inside: avoid; }

    .export { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 1rem; }

    @media (max-width: 640px) {
      .groups li button { grid-template-columns: 1fr 3rem; }
      .track { grid-column: 1 / -1; grid-row: 2; }
    }
  `],
})
export class WorkbenchComponent {
  private content = inject(ContentService);

  readonly schemes = SCHEMES;
  readonly UNASSIGNED = '\u0000unassigned';

  scheme: SchemeKey = 'topics';
  once = false;
  selected: string | null = null;
  note = '';

  topicRows: TopicRow[] = [];
  merge: Record<string, string> = {};
  rules: KeywordRule[] = DEFAULT_RULES.map((r) => ({ ...r }));

  result!: Result;
  maxSize = 1;

  private manifest: ArticleSummary[] = [];
  private bySlug = new Map<string, ArticleSummary>();
  private text = new Map<string, string>();
  private regions = new Map<string, string[]>();
  private labels = new Map<string, string>();
  private topicText = new Map<string, string>();
  private compiled: (((t: string, b: string, topics: string) => boolean) | null)[] = [];

  get current(): Scheme {
    return SCHEMES.find((s) => s.key === this.scheme)!;
  }

  ready$: Observable<boolean> = combineLatest([this.content.getSortedManifest(), this.content.getSearchIndex()]).pipe(
    map(([manifest, search]) => {
      this.manifest = manifest;
      this.bySlug = new Map(manifest.map((a) => [a.slug, a]));
      this.text = new Map(search.map((e) => [e.slug, e.text]));

      const counts = new Map<string, TopicRow>();
      for (const a of manifest) {
        for (const c of a.categories) {
          const row = counts.get(c.slug) ?? { slug: c.slug, name: c.name, label: c.name, count: 0 };
          row.count++;
          counts.set(c.slug, row);
        }
      }
      this.topicRows = [...counts.values()].sort((a, b) => b.count - a.count);
      // Two different topics can share a display name (e.g. "News"); keep them apart.
      const nameUses = new Map<string, number>();
      this.topicRows.forEach((t) => nameUses.set(t.name, (nameUses.get(t.name) ?? 0) + 1));
      this.topicRows.forEach((t) => {
        t.label = (nameUses.get(t.name) ?? 0) > 1 ? `${t.name} (${t.slug})` : t.name;
        this.labels.set(t.slug, t.label);
      });

      this.restore();
      this.recompute();
      return true;
    }),
  );

  setScheme(key: SchemeKey): void {
    this.scheme = key;
    this.selected = null;
    this.recompute();
  }

  setOnce(value: boolean): void {
    this.once = value;
    this.recompute();
  }

  select(name: string): void {
    this.selected = this.selected === name ? null : name;
  }

  // --- editors ---------------------------------------------------------

  setMerge(t: TopicRow, value: string): void {
    const v = value.trim();
    if (!v || v === t.label) {
      delete this.merge[t.slug];
    } else {
      this.merge[t.slug] = v;
    }
    this.persist();
    this.recompute();
  }

  loadProposal(): void {
    this.merge = { ...PROPOSED_MERGES };
    this.persist();
    this.recompute();
  }

  resetMerge(): void {
    this.merge = {};
    this.persist();
    this.recompute();
  }

  editRule(i: number, field: keyof KeywordRule, value: string): void {
    if (field === 'min') {
      this.rules[i].min = Math.max(1, Number(value) || 1);
    } else {
      (this.rules[i] as unknown as Record<string, string>)[field] = value;
    }
    this.persist();
    this.recompute();
  }

  addRule(): void {
    this.rules.push({ name: '', keywords: '', scope: 'title' });
    this.persist();
  }

  removeRule(i: number): void {
    this.rules.splice(i, 1);
    this.persist();
    this.recompute();
  }

  moveRule(i: number, by: number): void {
    const j = i + by;
    if (j < 0 || j >= this.rules.length) {
      return;
    }
    [this.rules[i], this.rules[j]] = [this.rules[j], this.rules[i]];
    this.persist();
    this.recompute();
  }

  /** The suggested nine labs; needs "count once" to read sensibly. */
  loadLabs(): void {
    this.rules = LAB_RULES.map((r) => ({ ...r }));
    this.once = true;
    this.persist();
    this.recompute();
  }

  resetRules(): void {
    this.rules = DEFAULT_RULES.map((r) => ({ ...r }));
    this.persist();
    this.recompute();
  }

  // --- results ---------------------------------------------------------

  members(): ArticleSummary[] {
    const slugs =
      this.selected === this.UNASSIGNED
        ? this.result.unassigned
        : this.result.groups.find((g) => g.name === this.selected)?.slugs ?? [];
    return slugs.map((s) => this.bySlug.get(s)!).filter(Boolean);
  }

  also() {
    return this.selected && this.selected !== this.UNASSIGNED ? alsoIn(this.result, this.selected) : [];
  }

  link(a: ArticleSummary): string[] {
    return articleLink(a);
  }

  /** Topic names and slugs plus a `section:<name>` token, for topic-scoped rules. */
  private topicsOf(a: ArticleSummary): string {
    let t = this.topicText.get(a.slug);
    if (t === undefined) {
      t = topicString(a);
      this.topicText.set(a.slug, t);
    }
    return t;
  }

  private recompute(): void {
    this.compiled = this.rules.map(compileRule);
    this.result = evaluate(this.manifest, (a) => this.assignFor(a), this.once);
    this.maxSize = Math.max(1, ...this.result.groups.map((g) => g.slugs.length), this.result.unassigned.length);
    if (this.selected && this.selected !== this.UNASSIGNED && !this.result.groups.some((g) => g.name === this.selected)) {
      this.selected = null;
    }
  }

  private assignFor(a: ArticleSummary): string[] {
    switch (this.scheme) {
      case 'topics':
        return a.categories.map((c) => this.labels.get(c.slug) ?? c.name);
      case 'sections':
        return [SECTION_LABELS[a.section ?? 'uncategorised'] ?? a.section ?? 'Uncategorised'];
      case 'type': {
        const t = classifyType(a.title);
        return t ? [t] : [];
      }
      case 'region': {
        let r = this.regions.get(a.slug);
        if (!r) {
          r = regionsOf(this.text.get(a.slug) ?? '');
          this.regions.set(a.slug, r);
        }
        return r;
      }
      case 'merge':
        return a.categories.map((c) => this.merge[c.slug] ?? this.labels.get(c.slug) ?? c.name);
      case 'rules': {
        const body = this.text.get(a.slug) ?? '';
        const topics = this.topicsOf(a);
        return this.rules.filter((_, i) => this.compiled[i]?.(a.title, body, topics)).map((r) => r.name.trim());
      }
    }
  }

  // --- persistence and export -------------------------------------------

  private restore(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
      if (saved?.merge && typeof saved.merge === 'object') {
        this.merge = saved.merge;
      }
      if (Array.isArray(saved?.rules)) {
        this.rules = saved.rules;
      }
    } catch {
      /* storage unavailable or corrupt: start from the defaults */
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ merge: this.merge, rules: this.rules }));
    } catch {
      /* private window or blocked storage: edits just won't survive a reload */
    }
  }

  downloadAssignments(): void {
    const groups: Record<string, string[]> = {};
    this.result.groups.forEach((g) => (groups[g.name] = g.slugs));
    const body = JSON.stringify({ scheme: this.scheme, countOnce: this.once, groups, unassigned: this.result.unassigned }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `grouping-${this.scheme}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async copyConfig(): Promise<void> {
    const config = this.scheme === 'merge' ? this.merge : this.rules;
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      this.note = 'Copied.';
    } catch {
      this.note = 'Could not copy automatically.';
    }
  }
}
