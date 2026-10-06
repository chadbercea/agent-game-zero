import { Vector3 } from 'three';
import { GRID } from './grid';

/**
 * A shared run: a stretch of floor where two or more lines travel together
 * along one grid axis, on the same grid line or a lane apart. `along` is the
 * axis they travel; the run spans [from, to] along it, and [low, high] across
 * it (the outermost lines' positions).
 */
export interface SharedRun {
  along: 'x' | 'z';
  from: number;
  to: number;
  low: number;
  high: number;
}

/** A square no run may extend into (a pad), by center and half-size. */
export interface Keepout {
  center: Vector3;
  half: number;
}

/** Shortest stretch that counts as a highway: two grid squares. */
export const MIN_RUN = 2 * GRID;
const EPS = 1e-6;

interface Segment {
  line: number;
  along: 'x' | 'z';
  /** Position across the axis (the grid line it runs on). */
  at: number;
  from: number;
  to: number;
}

function segments(lines: readonly (readonly Vector3[])[]): Segment[] {
  const out: Segment[] = [];
  lines.forEach((line, i) => {
    for (let k = 1; k < line.length; k++) {
      const [a, b] = [line[k - 1], line[k]];
      if (Math.abs(a.z - b.z) < EPS && Math.abs(a.x - b.x) > EPS) {
        out.push({ line: i, along: 'x', at: a.z, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) });
      } else if (Math.abs(a.x - b.x) < EPS && Math.abs(a.z - b.z) > EPS) {
        out.push({ line: i, along: 'z', at: a.x, from: Math.min(a.z, b.z), to: Math.max(a.z, b.z) });
      }
    }
  });
  return out;
}

/**
 * Find the information highways: every stretch where segments of two
 * different lines run along the same axis, at most a lane (GRID) apart, for
 * at least MIN_RUN. Overlapping finds on the same axis merge into one run.
 * Run ends are pulled back out of any keepout square (pads), and what's left
 * must still be at least MIN_RUN long.
 */
export function sharedRuns(lines: readonly (readonly Vector3[])[], keepouts: readonly Keepout[] = []): SharedRun[] {
  const segs = segments(lines);
  const found: SharedRun[] = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [s, t] = [segs[i], segs[j]];
      if (s.line === t.line || s.along !== t.along || Math.abs(s.at - t.at) > GRID + EPS) continue;
      const from = Math.max(s.from, t.from);
      const to = Math.min(s.to, t.to);
      if (to - from < MIN_RUN - EPS) continue;
      found.push({ along: s.along, from, to, low: Math.min(s.at, t.at), high: Math.max(s.at, t.at) });
    }
  }

  // Merge runs on the same axis that overlap both along and across (touching counts).
  const merged: SharedRun[] = [];
  for (const run of found) {
    const into = merged.find(
      (m) =>
        m.along === run.along &&
        run.from <= m.to + EPS &&
        m.from <= run.to + EPS &&
        run.low <= m.high + GRID + EPS &&
        m.low <= run.high + GRID + EPS,
    );
    if (into) {
      into.from = Math.min(into.from, run.from);
      into.to = Math.max(into.to, run.to);
      into.low = Math.min(into.low, run.low);
      into.high = Math.max(into.high, run.high);
    } else merged.push({ ...run });
  }

  // Pull the ends out of pads.
  return merged.flatMap((run) => {
    let { from, to } = run;
    for (const { center, half } of keepouts) {
      const across = run.along === 'x' ? center.z : center.x;
      const along = run.along === 'x' ? center.x : center.z;
      if (across + half < run.low - GRID / 2 || across - half > run.high + GRID / 2) continue;
      if (along - half <= from && along + half > from) from = along + half;
      if (along + half >= to && along - half < to) to = along - half;
    }
    // Square ends on grid lines.
    from = Math.ceil(from / GRID - EPS) * GRID;
    to = Math.floor(to / GRID + EPS) * GRID;
    return to - from >= MIN_RUN - EPS ? [{ ...run, from, to }] : [];
  });
}

/** Whether a floor point is inside a run's footprint (with half a lane of margin across). */
export function inRun(run: SharedRun, p: Vector3): boolean {
  const along = run.along === 'x' ? p.x : p.z;
  const across = run.along === 'x' ? p.z : p.x;
  return along >= run.from && along <= run.to && across >= run.low - GRID / 2 && across <= run.high + GRID / 2;
}

/** Whether two runs' footprints (half a lane of margin across each) overlap on the floor. */
export function runsOverlap(a: SharedRun, b: SharedRun): boolean {
  const box = (r: SharedRun) => {
    const [x0, x1] = r.along === 'x' ? [r.from, r.to] : [r.low - GRID / 2, r.high + GRID / 2];
    const [z0, z1] = r.along === 'x' ? [r.low - GRID / 2, r.high + GRID / 2] : [r.from, r.to];
    return { x0, x1, z0, z1 };
  };
  const [p, q] = [box(a), box(b)];
  return p.x0 < q.x1 && q.x0 < p.x1 && p.z0 < q.z1 && q.z0 < p.z1;
}
