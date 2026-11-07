import { Component, ElementRef, ViewChild } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';

/** The listing in the Synuefe XE-Y c17-7 Listening Post (English localisation). */
const MESSAGE =
  '8BFGTY4PLU67-RTYO06.45:GN63-74PHGJI E67-:F563-21-574.9 ER34.6-DER8+WEST U.5 -RTG10 RTH8-4 6T.WR4564-21 +G134.2 RT55.4 GDW THE42.1LY 764.2Y-45TG4.BTJ-Y. 6ORT437.1D341-67.Y5DS 243 45TY-3234';

const STRIDE = 8;
const START = 8; // the 9th character
/** Number of characters read before the reading slips one place to the right. */
const SLIP_AFTER = 6;

const JS_SOURCE = `// Read every 8th character starting from the 9th (index 8).
// After the first 6 characters ("LONG:-") the reading slips one place to the right.
function decode(message, start = 8, stride = 8, slipAfter = 6) {
  let out = '';
  let i = start;
  let n = 0;
  while (i < message.length) {
    out += message[i];
    n++;
    i += stride + (n === slipAfter ? 1 : 0);
  }
  return out;
}
`;

interface Hit { index: number; char: string; slipped: boolean }

/** Decoder for the Adamastor Listening Post message, in the style of the Hesperus log decoder. */
@Component({
  selector: 'app-adamastor-decoder',
  standalone: true,
  imports: [NgIf, NgFor],
  template: `
    <section class="dec" id="Adamastor-Decoder">
      <h3>Message decoder</h3>
      <p class="hint">
        Press Decrypt to reveal the hidden message and see how it is read.
        <button type="button" class="link" (click)="open()">View JavaScript source</button>
      </p>
      <div class="row">
        <button type="button" class="go" (click)="toggle()">{{ shown ? 'Hide' : 'Decrypt' }}</button>
      </div>

      <ng-container *ngIf="shown">
        <h4>Decoded</h4>
        <pre class="out result">{{ decoded }}</pre>
        <p class="hint">Read as: longitude −38.0, 615 LY away, body 3. The space between “LY” and “BODY” is missing from the extracted text.</p>

        <h4>The message in rows of 8 characters</h4>
        <p class="hint">Highlighted characters are the ones that are kept; the outlined one is where the reading slips. A dot stands for a space.</p>
        <div class="grid">
          <div class="line" *ngFor="let row of rows; let r = index">
            <span class="num">{{ r * 8 + 1 }}</span>
            <span *ngFor="let c of row" class="ch" [class.hit]="c.hit" [class.slip]="c.slip">{{ c.ch === ' ' ? '·' : c.ch }}</span>
          </div>
        </div>

        <h4>Steps</h4>
        <ol class="steps">
          <li><strong>Cut the message into rows of 8 characters.</strong> The message is {{ message.length }} characters long.</li>
          <li><strong>Start at the 9th character and keep every 8th one after it.</strong> That is the first character of the second row, then the first of the third, and so on.</li>
          <li><strong>The first six kept characters spell “{{ first }}”.</strong></li>
          <li><strong>Then the reading slips one place.</strong> The community suspects a stray space, or the WEST/OUEST localisation difference, shifted everything after that point. Moving one character to the right restores the text.</li>
          <li><strong>Keep reading every 8th character</strong> from there to the end: <span class="mono">{{ rest }}</span></li>
          <li><strong>Join them up</strong> to get <span class="mono">{{ decoded }}</span>.</li>
        </ol>
        <p class="hint">
          The method comes from the community write-up on the
          <a href="https://forums.frontier.co.uk/goto/post?id=8785055" target="_blank" rel="noopener noreferrer">Frontier forums</a>.
          The message gives a distance of about 615 LY and a "Body 3" location, plus a longitude for a planetary base (the latitude comes from the Adamastor's logs).
        </p>
      </ng-container>

      <dialog #dlg class="src-dialog" (click)="backdrop($event)">
        <div class="head">
          <strong>JavaScript source</strong>
          <span>
            <button type="button" (click)="copy()">{{ copied ? 'Copied' : 'Copy' }}</button>
            <button type="button" (click)="dlg.close()">Close</button>
          </span>
        </div>
        <pre><code>{{ js }}</code></pre>
      </dialog>
    </section>
  `,
  styles: [`
    .dec { margin: 1.5rem 0; padding: 1rem 1.25rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
    h3 { margin-top: 0; }
    .hint { color: var(--text-muted); font-size: 0.9rem; }
    .row { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; align-items: center; margin: 0.75rem 0; }
    button { background: var(--accent-dim); color: var(--accent-light); border: 1px solid var(--border); border-radius: 4px; padding: 0.3rem 0.8rem; font: inherit; cursor: pointer; }
    button.go { background: var(--accent); color: #0b0e13; border: none; padding: 0.4rem 1rem; }
    button.link { background: none; border: none; padding: 0; color: var(--accent-light); text-decoration: underline; }
    .steps { padding-left: 1.25rem; }
    .steps li { margin-bottom: 0.6rem; }
    .mono, .grid { font-family: monospace; }
    .out { white-space: pre-wrap; word-break: break-word; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 0.75rem; }
    .result { font-size: 1.15rem; letter-spacing: 0.04em; }
    .grid { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 0.75rem; overflow-x: auto; }
    .line { display: flex; gap: 0.25rem; white-space: pre; }
    .num { width: 2.5rem; color: var(--text-muted); text-align: right; margin-right: 0.5rem; }
    .ch { display: inline-block; width: 1.4rem; text-align: center; border-radius: 3px; }
    .ch.hit { background: var(--accent); color: #0b0e13; font-weight: bold; }
    .ch.slip { outline: 2px solid var(--accent-light); }
    dialog.src-dialog { width: min(900px, 94vw); max-height: 85vh; padding: 0; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; }
    dialog.src-dialog::backdrop { background: rgba(0, 0, 0, 0.6); }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.6rem 1rem; border-bottom: 1px solid var(--border); }
    .head span { display: flex; gap: 0.5rem; }
    dialog pre { margin: 0; padding: 1rem; overflow: auto; max-height: calc(85vh - 3.5rem); font-size: 0.85rem; }
  `],
})
export class AdamastorDecoderComponent {
  @ViewChild('dlg') dlg!: ElementRef<HTMLDialogElement>;

  readonly message = MESSAGE;
  readonly js = JS_SOURCE;
  shown = false;
  copied = false;

  readonly hits: Hit[] = (() => {
    const out: Hit[] = [];
    let i = START;
    let n = 0;
    while (i < MESSAGE.length) {
      out.push({ index: i, char: MESSAGE[i], slipped: n >= SLIP_AFTER });
      n++;
      i += STRIDE + (n === SLIP_AFTER ? 1 : 0);
    }
    return out;
  })();

  readonly decoded = this.hits.map((h) => h.char).join('');
  readonly first = this.hits.slice(0, SLIP_AFTER).map((h) => h.char).join('');
  readonly rest = this.hits.slice(SLIP_AFTER).map((h) => (h.char === ' ' ? '␣' : h.char)).join(' ');

  readonly rows = (() => {
    const hitAt = new Map(this.hits.map((h) => [h.index, h]));
    const rows: { ch: string; hit: boolean; slip: boolean }[][] = [];
    for (let p = 0; p < MESSAGE.length; p += STRIDE) {
      rows.push([...MESSAGE.slice(p, p + STRIDE)].map((ch, j) => {
        const h = hitAt.get(p + j);
        return { ch, hit: !!h, slip: !!h && h === this.hits[SLIP_AFTER] };
      }));
    }
    return rows;
  })();

  toggle(): void {
    this.shown = !this.shown;
  }

  open(): void {
    this.copied = false;
    this.dlg.nativeElement.showModal();
  }

  backdrop(e: MouseEvent): void {
    if (e.target === this.dlg.nativeElement) {
      this.dlg.nativeElement.close();
    }
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.js);
      this.copied = true;
    } catch { /* clipboard unavailable */ }
  }
}
