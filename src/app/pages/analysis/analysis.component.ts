import { Component, inject } from '@angular/core';
import { AsyncPipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { ArticleSummary, ContentService, NavCategory, articleLink } from '../../services/content.service';
import { WorkbenchComponent } from './workbench.component';
import { Cloud, TermIndex, TermScore, layoutCloud } from './wordcloud.model';
import {
  Analysis,
  LONG_CHARS,
  STUB_CHARS,
  TopicStat,
  TreemapRect,
  computeAnalysis,
  treemap,
} from './analysis.model';

const TREEMAP_W = 100;
const TREEMAP_H = 56;

interface NavRow {
  label: string;
  count: number;
  note?: string;
  depth: number;
  pct: number;
}

interface LiveNav {
  rows: NavRow[];
  /** Distinct articles that appear somewhere in the navigation. */
  placed: number;
  /** Extra placements: articles filed under more than one category or sub-category. */
  multi: number;
}

interface View {
  a: Analysis;
  tiles: TreemapRect<TopicStat>[];
  maxTopic: number;
  live: LiveNav;
  topMax: number;
  index: TermIndex;
  clouds: Map<string, Cloud>;
  typeCards: { label: string; count: number; terms: TermScore[] }[];
  shared: TermScore[];
}

@Component({
  selector: 'app-analysis',
  standalone: true,
  imports: [AsyncPipe, DecimalPipe, NgClass, NgFor, NgIf, RouterLink, WorkbenchComponent],
  template: `
    <ng-container *ngIf="view$ | async as v">
      <article class="container analysis">
        <nav class="breadcrumb"><a routerLink="/">Home</a> / Analysis</nav>

        <header>
          <p class="kicker">Content analysis · for site developers</p>
          <h1>{{ v.a.topTopicShare | number: '1.0-0' }}% of the archive sits in {{ v.a.topTopic.name }}</h1>
          <p class="standfirst">
            {{ v.a.topTopic.name }} holds {{ v.a.topTopic.count }} of {{ v.a.total }} articles. The other
            {{ v.a.topicCount - 1 }} categories share the rest, and the {{ v.a.sectionCount }} original URL sections
            cut across them. Categories here are the site's navigation categories, from
            <code>navigation.json</code>; an article filed under several appears in each. Every figure is
            computed from the content JSON when the page loads.
          </p>
        </header>

        <div class="stats">
          <div class="stat"><strong>{{ v.a.total }}</strong><span>articles</span></div>
          <div class="stat"><strong>{{ v.a.topicCount }}</strong><span>categories</span></div>
          <div class="stat"><strong>{{ v.a.sectionCount }}</strong><span>URL sections</span></div>
          <div class="stat"><strong>{{ v.a.noTopic.length }}</strong><span>not in the navigation</span></div>
          <div class="stat"><strong>{{ v.a.stubs }}</strong><span>stubs under {{ stubChars }} characters</span></div>
        </div>

        <!-- 1. Topics ---------------------------------------------------- -->
        <section>
          <h2>1. Articles per category</h2>
          <p class="lede">
            Tile area is the number of articles in a category. Colour shows the original URL section most of that
            category's articles come from.
          </p>
          <ul class="legend">
            <li><i class="sw g-codex"></i>Codex</li>
            <li><i class="sw g-news"></i>News / Media</li>
            <li><i class="sw g-lab"></i>Lab 69 XIA</li>
            <li><i class="sw g-other"></i>Other sections</li>
          </ul>
          <div class="treemap" role="img" [attr.aria-label]="treemapLabel(v)">
            <div
              class="tile"
              *ngFor="let t of v.tiles"
              [ngClass]="'g-' + t.item.group"
              [style.left.%]="(t.x / W) * 100"
              [style.top.%]="(t.y / H) * 100"
              [style.width.%]="(t.w / W) * 100"
              [style.height.%]="(t.h / H) * 100"
              [title]="t.item.name + ': ' + t.item.count + ' articles'"
            >
              <span class="tile-inner" *ngIf="t.w * t.h > 40">
                <b>{{ t.item.name }}</b>
                <span>{{ t.item.count }}</span>
              </span>
            </div>
          </div>

          <h3>Exact counts</h3>
          <ul class="bars">
            <li *ngFor="let t of v.a.topics">
              <a class="bar-label" [routerLink]="['/topics', t.slug]">{{ t.name }}</a>
              <span class="bar-track">
                <span class="bar-fill" [ngClass]="'g-' + t.group" [style.width.%]="(t.count / v.maxTopic) * 100"></span>
              </span>
              <span class="bar-value">{{ t.count }}</span>
            </li>
          </ul>
        </section>

        <!-- 2. Sections x topics ---------------------------------------- -->
        <section>
          <h2>2. Original sections against categories</h2>
          <p class="lede">
            Rows are the original URL sections, columns are navigation categories, cells count the articles. A
            category that fills only one row mirrors an old section; one that fills several draws from across the site.
          </p>
          <div class="matrix-wrap">
            <table class="matrix">
              <thead>
                <tr>
                  <th></th>
                  <th *ngFor="let c of v.a.heatmap.columns"><span>{{ c.name }}</span></th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let s of v.a.heatmap.sections; let i = index">
                  <th scope="row">{{ s.label }} <small>{{ s.count }}</small></th>
                  <td
                    *ngFor="let n of v.a.heatmap.cells[i]; let j = index"
                    [style.background]="cellColour(n, v.a.heatmap.max)"
                    [style.color]="n / v.a.heatmap.max > 0.45 ? '#0b0e13' : 'var(--text)'"
                    [title]="s.label + ' × ' + v.a.heatmap.columns[j].name + ': ' + n"
                  >{{ n || '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="findings">
            <div class="finding-group" *ngIf="v.a.duplicates.length">
              <h3>Identical categories</h3>
              <div class="finding" *ngFor="let f of v.a.duplicates"><strong>{{ f.title }}</strong><span>{{ f.detail }}</span></div>
            </div>
            <div class="finding-group" *ngIf="v.a.subtopics.length">
              <h3>Categories that sit inside another</h3>
              <div class="finding" *ngFor="let f of v.a.subtopics"><strong>{{ f.title }}</strong><span>{{ f.detail }}</span></div>
            </div>
            <div class="finding-group" *ngIf="v.a.crossSection.length">
              <h3>Categories that straddle sections</h3>
              <div class="finding" *ngFor="let f of v.a.crossSection"><strong>{{ f.title }}</strong><span>{{ f.detail }}</span></div>
            </div>
          </div>
        </section>

        <!-- 3. Inside the largest category ------------------------------ -->
        <section>
          <h2>3. What is inside {{ v.a.topCategory.name }}</h2>
          <p class="lede">
            The {{ v.a.topCategory.total }} articles in the largest category, split by the sub-categories you
            gave them. Open a sub-category to check its members.
          </p>
          <div class="types">
            <details *ngFor="let b of v.a.topCategory.buckets" [open]="false">
              <summary>
                <span class="type-name">{{ b.label }}</span>
                <span class="bar-track"><span class="bar-fill g-codex" [style.width.%]="(b.articles.length / v.topMax) * 100"></span></span>
                <span class="bar-value">{{ b.articles.length }}</span>
              </summary>
              <ul class="members">
                <li *ngFor="let a of b.articles"><a [routerLink]="link(a)">{{ a.title }}</a></li>
              </ul>
            </details>
          </div>
        </section>

        <!-- 4. Words ------------------------------------------------------ -->
        <section>
          <h2>4. What the articles actually say</h2>
          <p class="lede">
            Words from the article bodies, not the titles. Size shows how <em>distinctive</em> a word is for
            the group: common inside it, rare elsewhere. So everyday words and words used everywhere drop out.
            Click a word to search for it.
          </p>
          <label class="picker">
            Show words for
            <select [value]="selected" (change)="selected = $any($event.target).value">
              <option *ngFor="let g of groupsOfKind(v, 'all')" [value]="g.key">{{ g.label }}</option>
              <optgroup label="Categories">
                <option *ngFor="let g of groupsOfKind(v, 'topic')" [value]="g.key">{{ g.label }}</option>
              </optgroup>
              <optgroup label="Sub-categories of the largest category (measured against the rest of it)">
                <option *ngFor="let g of groupsOfKind(v, 'type')" [value]="g.key">{{ g.label }}</option>
              </optgroup>
            </select>
          </label>
          <div class="cloud-scroll" *ngIf="cloudFor(v) as cloud">
            <div class="cloud" role="img" [attr.aria-label]="cloudLabel(cloud)">
              <a
                *ngFor="let w of cloud.words"
                class="cw"
                routerLink="/search"
                [queryParams]="{ q: w.term }"
                [style.left.%]="(w.x / cloud.width) * 100"
                [style.top.%]="(w.y / cloud.height) * 100"
                [style.font-size]="(w.size / cloud.width) * 100 + 'cqw'"
                [style.color]="wordColour(w.weight)"
                [title]="w.term + ': in ' + w.df + ' articles'"
              >{{ w.term }}</a>
            </div>
          </div>

          <h3>Words found in a third of all {{ v.a.topCategory.name }} articles</h3>
          <p class="lede">
            These are template, not topic: the same write-up structure repeats across the topic. They explain
            why this category reads as one blob, and they are worth stripping from excerpts and search snippets.
          </p>
          <ul class="chips plain">
            <li *ngFor="let t of v.shared">{{ t.term }} <small>{{ t.df }}</small></li>
          </ul>

          <h3>Signature words of each sub-category</h3>
          <div class="cards">
            <div class="card-mini" *ngFor="let c of v.typeCards">
              <strong>{{ c.label }} <small>{{ c.count }}</small></strong>
              <span>{{ termList(c.terms) }}</span>
            </div>
          </div>
        </section>

        <!-- 5. Shape ----------------------------------------------------- -->
        <section>
          <h2>5. Article length varies enormously by section</h2>
          <p class="lede">
            Length is the characters of plain text. Short stubs ({{ stubChars }} or fewer) are usually a
            picture or a one-line entry; long reads ({{ longChars }}+) need a different card than a stub.
          </p>
          <div class="matrix-wrap">
            <table class="shape">
              <thead>
                <tr><th>Section</th><th>Articles</th><th>Median length</th><th>Stubs</th><th>Long reads</th></tr>
              </thead>
              <tbody>
                <tr *ngFor="let s of v.a.heatmap.sections">
                  <th scope="row">{{ s.label }}</th>
                  <td>{{ s.count }}</td>
                  <td>{{ s.medianChars | number: '1.0-0' }}</td>
                  <td>{{ s.stubPct | number: '1.0-0' }}%</td>
                  <td>{{ s.longPct | number: '1.0-0' }}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>Articles not in the navigation ({{ v.a.noTopic.length }})</h3>
          <p class="lede">
            Not sorted yet, or added after the last content build.
          </p>
          <ul class="chips">
            <li *ngFor="let a of v.a.noTopic"><a [routerLink]="link(a)">{{ a.title }}</a></li>
          </ul>
        </section>

        <!-- 5. Proposal -------------------------------------------------- -->
        <section>
          <h2>6. The navigation as it stands</h2>
          <p class="lede" *ngIf="v.live.rows.length; else noNav">
            Read live from <code>navigation.json</code>, which is built from your sorted export. It has
            {{ v.live.placed }} of {{ v.a.total }} articles placed<ng-container *ngIf="v.live.multi">, and
            {{ v.live.multi }} placement{{ v.live.multi === 1 ? '' : 's' }} where an article sits in more than one
            sub-category</ng-container>. Apply the sorter export with <code>node tools/apply-sorted.mjs</code> and rebuild to refresh it.
          </p>
          <ng-template #noNav>
            <p class="lede">navigation.json could not be loaded, so there is no live navigation to show.</p>
          </ng-template>
          <ul class="tree" *ngIf="v.live.rows.length">
            <li *ngFor="let r of v.live.rows" [style.padding-left.rem]="r.depth * 1.4" [class.top]="r.depth === 0">
              <span class="tree-label">{{ r.label }}</span>
              <span class="bar-track"><span class="bar-fill g-codex" [style.width.%]="r.pct"></span></span>
              <span class="bar-value">{{ r.count }}</span>
            </li>
          </ul>
        </section>

        <!-- 7. Workbench ------------------------------------------------- -->
        <section>
          <h2>7. Try your own grouping</h2>
          <p class="lede">
            Switch between ways of grouping the archive, merge topics, or write keyword rules of your own, and
            watch how balanced the result is. The numbers to watch are how much sits in the largest group,
            how many equal groups the split behaves like, and how many articles end up unassigned. Your edits
            are kept in this browser only; use the buttons at the bottom to take a grouping away.
            To file articles into categories and sub-categories by hand, newest first, use the
            <a routerLink="/analysis/sorter">article sorter</a>.
          </p>
          <app-workbench></app-workbench>
        </section>

        <footer class="method">
          <h2>Method and caveats</h2>
          <ul>
            <li>Source: the archive's <code>manifest.json</code>, <code>search-index.json</code> and <code>navigation.json</code>, read in the browser. Counts update when the content or the navigation is rebuilt.</li>
            <li>An article can sit in several categories, so category counts can add up to more than {{ v.a.total }}.</li>
            <li>Word clouds use the search-index text with common English words removed. A word's size is its share of the group's articles times how rare it is across the archive (or, for the sub-categories, across the largest category). Plurals are folded into the singular where both appear.</li>
            <li>Length is the length of the search-index text, which is the article body stripped of HTML.</li>
            <li>This is about structure, not quality. Nothing here says an article is good or bad.</li>
          </ul>
        </footer>
      </article>
    </ng-container>
  `,
  styles: [`
    :host {
      --g-codex: #3987e5;
      --g-news: #d95926;
      --g-lab: #199e70;
      --g-other: #5b6575;
    }

    .analysis {
      padding: 2.5rem 1.5rem 5rem;
      max-width: 980px;
    }

    .breadcrumb { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem; }
    .kicker { color: var(--accent-light); font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 0.4rem; }
    h1 { font-size: 2.2rem; max-width: 22ch; }
    .standfirst { color: var(--text-muted); font-size: 1.05rem; max-width: 68ch; }

    section { margin-top: 3.5rem; }
    h2 { font-size: 1.4rem; max-width: 40ch; }
    h3 { font-size: 1rem; margin: 2rem 0 0.75rem; }
    .lede { color: var(--text-muted); max-width: 68ch; }

    .stats { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.5rem; }
    .stat {
      flex: 1 1 130px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.85rem 1rem;
      display: flex;
      flex-direction: column;
    }
    .stat strong { font-family: var(--font-display); font-size: 1.8rem; line-height: 1.1; }
    .stat span { color: var(--text-muted); font-size: 0.8rem; }

    .g-codex { --c: var(--g-codex); }
    .g-news { --c: var(--g-news); }
    .g-lab { --c: var(--g-lab); }
    .g-other { --c: var(--g-other); }

    .legend { display: flex; flex-wrap: wrap; gap: 1.1rem; list-style: none; padding: 0; margin: 0.5rem 0 0.75rem; font-size: 0.85rem; }
    .sw { display: inline-block; width: 0.8rem; height: 0.8rem; border-radius: 3px; margin-right: 0.4rem; background: var(--c); vertical-align: -1px; }

    .treemap {
      position: relative;
      width: 100%;
      aspect-ratio: 100 / 56;
      min-height: 280px;
      background: var(--bg);
    }
    .tile {
      position: absolute;
      background: var(--c);
      border: 2px solid var(--bg);
      border-radius: 4px;
      overflow: hidden;
      color: #0b0e13;
    }
    .tile-inner { display: flex; flex-direction: column; padding: 0.4rem 0.5rem; line-height: 1.2; font-size: 0.78rem; }
    .tile-inner b { font-weight: 600; }

    .bars, .tree { list-style: none; padding: 0; margin: 0; }
    .bars li, .tree li, summary { display: grid; grid-template-columns: minmax(150px, 15rem) 1fr 3rem; gap: 0.75rem; align-items: center; padding: 0.25rem 0; font-size: 0.88rem; }
    .bar-track { height: 10px; background: var(--surface); border-radius: 0 3px 3px 0; }
    .bar-fill { display: block; height: 100%; background: var(--c); border-radius: 0 3px 3px 0; min-width: 2px; }
    .bar-value { text-align: right; font-variant-numeric: tabular-nums; color: var(--text-muted); }
    .bar-label, .tree-label, .type-name { overflow: hidden; text-overflow: ellipsis; }
    small { color: var(--text-muted); font-size: 0.78rem; }

    .matrix-wrap { overflow-x: auto; margin-top: 1rem; border: 1px solid var(--border); border-radius: var(--radius); }
    table { border-collapse: collapse; width: 100%; font-size: 0.8rem; }
    .matrix th, .matrix td { padding: 0; text-align: center; border: 1px solid var(--bg); min-width: 2.1rem; height: 2rem; }
    .matrix thead th { height: 9.5rem; vertical-align: bottom; font-weight: 500; color: var(--text-muted); }
    .matrix thead th span { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; padding: 0.4rem 0; }
    .matrix tbody th { text-align: left; padding: 0 0.75rem; white-space: nowrap; font-weight: 500; position: sticky; left: 0; background: var(--bg); }
    .matrix td { font-variant-numeric: tabular-nums; }

    .shape th, .shape td { padding: 0.5rem 0.75rem; text-align: right; border-bottom: 1px solid var(--border); }
    .shape th:first-child { text-align: left; }
    .shape thead th { color: var(--text-muted); font-weight: 500; }

    .findings { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem; margin-top: 1rem; }
    .finding { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.7rem 0.9rem; margin-bottom: 0.6rem; display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.88rem; }
    .finding span { color: var(--text-muted); font-size: 0.82rem; }

    .types { margin-top: 1rem; }
    details { border-bottom: 1px solid var(--border); }
    summary { cursor: pointer; list-style: none; grid-template-columns: minmax(180px, 20rem) 1fr 3rem; padding: 0.55rem 0; }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: '▸'; position: absolute; margin-left: -1.1rem; color: var(--text-muted); }
    details[open] summary::before { content: '▾'; }
    details { padding-left: 1.1rem; }
    .type-name small { display: block; }
    .members { columns: 2 220px; padding: 0 0 0.75rem 0; margin: 0; list-style: none; font-size: 0.85rem; }
    .members li { padding: 0.1rem 0; break-inside: avoid; }

    .picker { display: block; margin: 1rem 0 0.75rem; font-size: 0.85rem; color: var(--text-muted); }
    .picker select { margin-left: 0.5rem; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 0.4rem 0.6rem; font: inherit; max-width: 100%; }
    .cloud-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
    .cloud { position: relative; container-type: inline-size; min-width: 640px; aspect-ratio: 900 / 440; }
    .cw { position: absolute; transform: translate(-50%, -50%); white-space: nowrap; line-height: 1; font-family: var(--font-display); font-weight: 600; }
    .cw:hover { text-decoration: underline; color: var(--text) !important; }
    .chips.plain li { background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 0.2rem 0.7rem; font-size: 0.82rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0.75rem; margin-top: 0.75rem; }
    .card-mini { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.7rem 0.9rem; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; }
    .card-mini span { color: var(--text-muted); }
    .chips { display: flex; flex-wrap: wrap; gap: 0.5rem; list-style: none; padding: 0; margin: 0.75rem 0 0; }
    .chips a { display: inline-block; background: var(--accent-dim); border: 1px solid var(--border); border-radius: 999px; padding: 0.2rem 0.7rem; font-size: 0.8rem; color: var(--accent-light); }

    .tree li { grid-template-columns: minmax(200px, 26rem) 1fr 3rem; }
    .tree li.top { margin-top: 0.6rem; font-weight: 600; font-size: 0.95rem; }
    .tree li.top .tree-label small { font-weight: 400; }

    .method { margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 0.85rem; }
    .method h2 { font-size: 1.05rem; color: var(--text); }
    .method li { margin-bottom: 0.3rem; }

    @media (max-width: 640px) {
      h1 { font-size: 1.7rem; }
      .bars li, .tree li, summary { grid-template-columns: 1fr 3rem; }
      .bar-track { grid-column: 1 / -1; grid-row: 2; }
      .tree li { padding-left: 0 !important; }
    }
  `],
})
export class AnalysisComponent {
  private content = inject(ContentService);

  selected = 'all';

  readonly W = TREEMAP_W;
  readonly H = TREEMAP_H;
  readonly stubChars = STUB_CHARS;
  readonly longChars = LONG_CHARS;

  view$: Observable<View> = combineLatest([this.content.getSortedManifest(), this.content.getSearchIndex(), this.content.getNavigation()]).pipe(
    map(([manifest, search, navigation]) => {
      const a = computeAnalysis(manifest, search, navigation);
      const index = new TermIndex(search);
      const cartSlugs = a.cloudGroups.find((g) => g.kind === 'type')?.universe ?? [];
      return {
        a,
        tiles: treemap(a.topics.map((t) => ({ item: t, value: t.count })), TREEMAP_W, TREEMAP_H),
        maxTopic: a.topics[0].count,
        live: liveNav(navigation),
        index,
        clouds: new Map<string, Cloud>(),
        shared: index.common(cartSlugs, 1 / 3, 10),
        typeCards: a.cloudGroups
          .filter((g) => g.kind === 'type')
          .map((g) => ({
            label: g.label.replace(/ \(\d+\)$/, ''),
            count: g.slugs.length,
            terms: index.distinctive(g.slugs, 10, g.universe),
          })),
        topMax: Math.max(1, ...a.topCategory.buckets.map((b) => b.articles.length)),
      };
    }),
  );

  link(a: ArticleSummary): string[] {
    return articleLink(a);
  }

  /** Sequential ramp on the dark surface: more articles -> stronger blue. */
  cellColour(n: number, max: number): string {
    if (n === 0) {
      return 'transparent';
    }
    const alpha = 0.18 + 0.82 * Math.sqrt(n / max);
    return `rgba(57, 135, 229, ${alpha.toFixed(2)})`;
  }

  groupsOfKind(v: View, kind: 'all' | 'topic' | 'type') {
    return v.a.cloudGroups.filter((g) => g.kind === kind);
  }

  cloudFor(v: View): Cloud | null {
    const group = v.a.cloudGroups.find((g) => g.key === this.selected);
    if (!group) {
      return null;
    }
    let cloud = v.clouds.get(group.key);
    if (!cloud) {
      cloud = layoutCloud(v.index.distinctive(group.slugs, 60, group.universe));
      v.clouds.set(group.key, cloud);
    }
    return cloud;
  }

  cloudLabel(cloud: Cloud): string {
    const top = cloud.words.slice(0, 8).map((w) => w.term).join(', ');
    return `Word cloud of the most distinctive words. Largest: ${top}.`;
  }

  /** Lighter and warmer for more distinctive words; size carries the same signal. */
  wordColour(weight: number): string {
    return `color-mix(in srgb, var(--accent-light) ${Math.round(weight * 100)}%, var(--text-muted))`;
  }

  termList(terms: TermScore[]): string {
    return terms.map((t) => t.term).join(' · ');
  }

  treemapLabel(v: View): string {
    const top = v.a.topics.slice(0, 3).map((t) => `${t.name} ${t.count}`).join(', ');
    return `Treemap of ${v.a.topicCount} topics sized by article count. Largest: ${top}.`;
  }
}

function liveNav(navigation: NavCategory[]): LiveNav {
  const max = Math.max(1, ...navigation.map((c) => c.count));
  const rows: NavRow[] = navigation.flatMap((c) => [
    { label: c.name, count: c.count, depth: 0, pct: (c.count / max) * 100 },
    ...c.subs.map((sub) => ({ label: sub.name, count: sub.count, depth: 1, pct: (sub.count / max) * 100 })),
  ]);
  const seen = new Set<string>();
  let placements = 0;
  for (const c of navigation) {
    for (const slug of [...c.articles, ...c.subs.flatMap((sub) => sub.articles)]) {
      seen.add(slug);
      placements++;
    }
  }
  return {
    rows,
    placed: seen.size,
    multi: placements - seen.size,
  };
}
