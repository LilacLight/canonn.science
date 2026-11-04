import { Component, Input, OnInit } from '@angular/core';
import { NgFor } from '@angular/common';

export interface ItinerarySystem {
  name: string;
  /** Weeks after the start date that the Gnosis arrives (the cycle is 8 weeks). */
  week: number;
}

interface Row {
  name: string;
  begin: Date;
  arrival: string;
  departure: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY = 24 * 60 * 60 * 1000;

/** "September 10, 3306" from a Date's UTC fields. */
function fmt(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}, ${d.getUTCFullYear()}`;
}

/**
 * Replaces the date-fns/jQuery script that filled the Gnosis itinerary table in
 * "The Gnosis" and "We Still Have Gin". Same logic as the original, without the
 * libraries: the Gnosis jumps weekly (Thursdays) round an 8-system loop, and each
 * system's next visit is shown in in-game years (real year + 1286).
 */
@Component({
  selector: 'app-gnosis-itinerary',
  standalone: true,
  imports: [NgFor],
  template: `
    <table>
      <thead><tr><th>System</th><th>Arrival</th><th>Departure</th></tr></thead>
      <tbody>
        <tr *ngFor="let r of rows"><td>{{ r.name }}</td><td>{{ r.arrival }}</td><td>{{ r.departure }}</td></tr>
      </tbody>
    </table>
  `,
})
export class GnosisItineraryComponent implements OnInit {
  /** [year, month (0-based, as in Date.UTC), day] of the first arrival. */
  @Input() start: [number, number, number] = [2020, 8, 10];
  @Input() systems: ItinerarySystem[] = [];

  rows: Row[] = [];

  ngOnInit(): void {
    this.rows = this.compute(new Date());
  }

  private compute(now: Date): Row[] {
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const isoDay = (d: Date) => d.getDay() || 7;
    const THURSDAY = 4;

    const startDate = startOfDay(new Date(Date.UTC(...this.start)));
    const today = startOfDay(now);
    // The most recent Thursday strictly before today.
    const base = isoDay(today) <= THURSDAY ? addDays(today, -7) : today;
    const lastJump = addDays(base, THURSDAY - isoDay(base));

    return this.systems
      .map((s) => {
        const visit = addDays(startDate, 7 * s.week);
        const days = Math.round((visit.getTime() - lastJump.getTime()) / DAY);
        let weeks = Math.trunc(days / 7) % 8;
        if (weeks < 0) {
          weeks += 8;
        }
        const next = addDays(lastJump, 7 * weeks);
        const begin = new Date(Date.UTC(next.getFullYear() + 1286, next.getMonth(), next.getDate()));
        const end = new Date(begin.getTime() + 7 * DAY);
        return { name: s.name, begin, arrival: fmt(begin), departure: fmt(end) };
      })
      .sort((a, b) => a.begin.getTime() - b.begin.getTime());
  }
}
