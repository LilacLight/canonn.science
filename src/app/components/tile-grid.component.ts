import { Component, Input } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';

export interface Tile {
  name: string;
  count: number;
  thumb: string | null;
  link: string[];
  /** Small line after the count, e.g. "4 sub-categories". */
  detail?: string;
}

/** A grid of image tiles, each linking on to the next level. */
@Component({
  selector: 'app-tile-grid',
  standalone: true,
  imports: [NgFor, NgIf, RouterLink],
  template: `
    <div class="tile-grid">
      <a class="tile" *ngFor="let t of tiles" [routerLink]="t.link">
        <div class="tile-media">
          <img *ngIf="t.thumb" [src]="t.thumb" alt="" loading="lazy" />
          <span *ngIf="!t.thumb" class="tile-initial" aria-hidden="true">{{ t.name.charAt(0) }}</span>
        </div>
        <div class="tile-body">
          <span class="tile-name">{{ t.name }}</span>
          <span class="tile-count">
            {{ t.count }} article{{ t.count === 1 ? '' : 's' }}<ng-container *ngIf="t.detail"> · {{ t.detail }}</ng-container>
          </span>
        </div>
      </a>
    </div>
  `,
  styles: [`
    .tile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
    .tile {
      display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); overflow: hidden; color: var(--text); transition: border-color 0.15s, transform 0.15s;
    }
    .tile:hover { text-decoration: none; border-color: var(--accent); transform: translateY(-2px); }
    .tile-media { aspect-ratio: 16 / 9; background: var(--bg); display: flex; align-items: center; justify-content: center; }
    .tile-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .tile-initial { font-family: var(--font-display); font-size: 3rem; color: var(--accent); opacity: 0.5; }
    .tile-body { display: flex; flex-direction: column; gap: 0.4rem; padding: 1rem 1.2rem 1.15rem; }
    .tile-name { font-family: var(--font-display); font-weight: 600; font-size: 1.02rem; }
    .tile-count { color: var(--text-muted); font-size: 0.82rem; }
  `],
})
export class TileGridComponent {
  @Input({ required: true }) tiles: Tile[] = [];
}
