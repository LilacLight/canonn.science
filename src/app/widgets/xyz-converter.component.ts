import { Component } from '@angular/core';

/**
 * Replaces the hand-written <form> + <script> calculator in the archived article
 * "Converting Legacy Coordinates to XYZ" (the HTML cleaner strips both, as it
 * must). The arithmetic is the original's, unchanged -- including that the
 * script feeds the "Ascension" box in as the first argument of gal2xyz and the
 * "Declination" box in as the second.
 */
@Component({
  selector: 'app-xyz-converter',
  standalone: true,
  template: `
    <form class="xyz" (submit)="calc($event, dec.value, asc.value, dist.value)">
      <div class="row">
        <label>Declination <input #dec type="number" step="any" name="declination" /></label>
        <label>Ascension <input #asc type="number" step="any" name="ascension" /></label>
        <label>Distance <input #dist type="number" step="any" name="distance" /></label>
      </div>
      <div class="row">
        <label>X <input type="number" step="any" readonly [value]="x" aria-label="X" /></label>
        <label>Y <input type="number" step="any" readonly [value]="y" aria-label="Y" /></label>
        <label>Z <input type="number" step="any" readonly [value]="z" aria-label="Z" /></label>
        <button type="submit">Submit</button>
      </div>
    </form>
  `,
  styles: [`
    .xyz { margin: 1.5rem 0; padding: 1rem 1.25rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
    .row { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; align-items: center; }
    .row + .row { margin-top: 0.75rem; }
    label { display: flex; align-items: center; gap: 0.4rem; color: var(--text-muted); font-size: 0.9rem; }
    input { width: 9rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 0.35rem 0.5rem; font: inherit; }
    input[readonly] { opacity: 0.85; }
    button { background: var(--accent); color: #0b0e13; border: none; border-radius: 4px; padding: 0.4rem 1rem; font: inherit; cursor: pointer; }
    button:hover { background: var(--accent-light); }
  `],
})
export class XyzConverterComponent {
  x = '';
  y = '';
  z = '';

  calc(event: Event, declination: string, ascension: string, distance: string): void {
    event.preventDefault();
    const rad = (deg: number) => deg * (Math.PI / 180);
    // Original: a = gal2xyz(ascension, declination, distance), where
    // gal2xyz(declination, ascension, distance) returns [d*sin(-rad(dec)), d*sin(rad(asc)), d*cos(rad(dec))].
    const dec = Number(ascension);
    const asc = Number(declination);
    const d = Number(distance);
    this.x = String(d * Math.sin(0 - rad(dec)));
    this.y = String(d * Math.sin(rad(asc)));
    this.z = String(d * Math.cos(rad(dec)));
  }
}
