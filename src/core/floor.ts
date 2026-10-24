import type { Vector3 } from 'three';
import { type FloorRect, offsetRect, type PanelDirection, unitLayout } from '../primitives/unit/unitLayout';
import { GRID } from './grid';

/** Room kept between a unit's border and anything else standing, or a line that isn't its own. */
export const UNIT_ROOM = GRID / 2;
/** Shortest a line may be left once it's cut back to the borders it ends on. */
export const MIN_SHOWING = 1;
/** Step lines are sampled at when tested against a border. */
const STEP = GRID / 10;
const EPS = 1e-6;

/** A node with a ground panel: where it stands, and how wide it stands. */
export interface UnitSpot {
  at: Vector3;
  size: number;
}

const borders = new Map<string, FloorRect>();
/** A unit's border on the floor with its panel lying `direction`. */
export function unitBorder(spot: UnitSpot, direction: PanelDirection): FloorRect {
  const key = `${direction}${spot.size}`;
  let border = borders.get(key);
  if (!border) borders.set(key, (border = unitLayout(direction, spot.size).border));
  return offsetRect(border, spot.at.x, spot.at.z);
}

/** A square of `size` round `at` (a gate, a terminal: something standing without a panel). */
export function squareAt(at: Vector3, size: number): FloorRect {
  const h = size / 2;
  return { minX: at.x - h, maxX: at.x + h, minZ: at.z - h, maxZ: at.z + h };
}

export const grown = (r: FloorRect, by: number): FloorRect => ({ minX: r.minX - by, maxX: r.maxX + by, minZ: r.minZ - by, maxZ: r.maxZ + by });
const inside = (r: FloorRect, x: number, z: number) => x > r.minX + EPS && x < r.maxX - EPS && z > r.minZ + EPS && z < r.maxZ - EPS;
const overlaps = (a: FloorRect, b: FloorRect) => a.minX < b.maxX - EPS && b.minX < a.maxX - EPS && a.minZ < b.maxZ - EPS && b.minZ < a.maxZ - EPS;

/** A line sampled every STEP, first to last, with its bounding box (worked out once per line). */
interface Sampled {
  pts: [number, number][];
  box: FloorRect;
}
const sampledLines = new WeakMap<readonly Vector3[], Sampled>();
function sampled(line: readonly Vector3[]): Sampled {
  let got = sampledLines.get(line);
  if (got) return got;
  const pts: [number, number][] = [[line[0].x, line[0].z]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / STEP));
    for (let k = 1; k <= n; k++) pts.push([a.x + ((b.x - a.x) * k) / n, a.z + ((b.z - a.z) * k) / n]);
  }
  const xs = line.map((p) => p.x);
  const zs = line.map((p) => p.z);
  got = { pts, box: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) } };
  sampledLines.set(line, got);
  return got;
}
const samples = (line: readonly Vector3[]) => sampled(line).pts;
/** Whether any of `line` runs inside `rect` (its box first, to skip most lines at once). */
function runsInside(line: readonly Vector3[], rect: FloorRect): boolean {
  const { pts, box } = sampled(line);
  if (box.maxX <= rect.minX || box.minX >= rect.maxX || box.maxZ <= rect.minZ || box.minZ >= rect.maxZ) return false;
  return pts.some(([x, z]) => inside(rect, x, z));
}

const lengthOf = (line: readonly Vector3[]) => line.reduce((sum, p, i) => sum + (i ? p.distanceTo(line[i - 1]) : 0), 0);

/** Whether `p` is on the node standing at `at`, `half` its width each way (a line ending there is that node's). */
const onNode = (p: Vector3, at: Vector3, half: number) => Math.abs(p.x - at.x) <= half + EPS && Math.abs(p.z - at.z) <= half + EPS;

/** Which end of `line` (0 first, 1 last) is on the node at `at`, or -1 for neither. */
function endOn(line: readonly Vector3[], at: Vector3, half: number): number {
  if (onNode(line[0], at, half)) return 0;
  return onNode(line[line.length - 1], at, half) ? 1 : -1;
}

/**
 * How much of `line` lies inside `rect` at its `end` (0 first, 1 last), if
 * it comes in only once there (a line is cut where it first meets the border
 * of a unit it ends at); -1 if it leaves the border again on the way in.
 */
function endInside(line: readonly Vector3[], end: number, rect: FloorRect): number {
  if (!runsInside(line, rect)) return 0;
  const pts = samples(line);
  const fromFar = end === 0 ? [...pts].reverse() : pts;
  const enter = fromFar.findIndex(([x, z]) => inside(rect, x, z));
  if (enter < 0) return 0;
  if (fromFar.slice(enter).some(([x, z]) => !inside(rect, x, z))) return -1;
  return (fromFar.length - 1 - enter) * STEP;
}

interface Standing {
  rect: FloorRect;
  /** For a unit, its node: lines ending on it may come in. */
  node?: UnitSpot;
}

/**
 * The floor of a map as it's laid out: every unit's border, everything else
 * standing (gates, terminals), and every line. A unit may stand where its
 * border (and UNIT_ROOM round it) is clear of everything standing and of
 * every line but its own; a line may run where it passes no border but those
 * of the units it ends at, and only comes into those once, leaving at least
 * MIN_SHOWING showing. (Lines may meet parts: they run to terminals and
 * gates; the map's own spacing rules keep the rest apart.)
 */
export class Floor {
  private readonly standing: Standing[] = [];
  private readonly lines: (readonly Vector3[])[] = [];

  constructor(from?: Floor) {
    if (from) {
      this.standing.push(...from.standing);
      this.lines.push(...from.lines);
    }
  }

  /** A copy to try things on; the original is untouched. */
  fork(): Floor {
    return new Floor(this);
  }

  addUnit(spot: UnitSpot, direction: PanelDirection): void {
    this.standing.push({ rect: unitBorder(spot, direction), node: spot });
  }

  addPart(rect: FloorRect): void {
    this.standing.push({ rect });
  }

  addLine(line: readonly Vector3[]): void {
    this.lines.push(line);
  }

  /** Whether a unit at `spot` may lie `direction`, with `own` lines (not on the floor yet) ending at it. */
  canStand(spot: UnitSpot, direction: PanelDirection, own: readonly (readonly Vector3[])[] = []): boolean {
    const rect = unitBorder(spot, direction);
    const room = grown(rect, UNIT_ROOM);
    for (const s of this.standing) if (overlaps(room, s.rect)) return false;
    const half = spot.size / 2;
    const clear = (line: readonly Vector3[]) => {
      const end = endOn(line, spot.at, half);
      return end >= 0 ? endInside(line, end, rect) >= 0 : !runsInside(line, room);
    };
    for (const line of this.lines) if (!clear(line)) return false;
    for (const line of own) if (!clear(line)) return false;
    if (!own.length) return true;
    const me = [{ rect, node: spot }];
    return own.every((line) => this.lineFits(line, me));
  }

  /** The first way (of `ways`) a unit at `spot` may lie, or null. */
  wayFor(spot: UnitSpot, ways: readonly PanelDirection[], own: readonly (readonly Vector3[])[] = []): PanelDirection | null {
    return ways.find((d) => this.canStand(spot, d, own)) ?? null;
  }

  /** Whether a part (no panel, no lines of its own) may stand on `rect`: clear of every unit and its room, and of other parts. */
  partFits(rect: FloorRect): boolean {
    return this.standing.every((s) => !overlaps(s.node ? grown(s.rect, UNIT_ROOM) : s.rect, rect));
  }

  /** Whether `line` may run: through no border but its own ends', once each, still showing MIN_SHOWING (`more`: units not on the floor yet). */
  lineFits(line: readonly Vector3[], more: readonly Standing[] = []): boolean {
    let hidden = 0;
    const check = (s: Standing): boolean => {
      if (!s.node) return true;
      const end = endOn(line, s.node.at, s.node.size / 2);
      if (end < 0) return !runsInside(line, grown(s.rect, UNIT_ROOM));
      const cut = endInside(line, end, s.rect);
      hidden += cut;
      return cut >= 0;
    };
    for (const s of this.standing) if (!check(s)) return false;
    for (const s of more) if (!check(s)) return false;
    return lengthOf(line) - hidden >= MIN_SHOWING;
  }

  /** Whether every line on the floor still fits (once all the units it ends at stand). */
  linesFit(): boolean {
    return this.lines.every((line) => this.lineFits(line));
  }

  /** Every unit's border, for framing the map. */
  get borders(): FloorRect[] {
    return this.standing.filter((s) => s.node).map((s) => s.rect);
  }

  /** A unit not on the floor yet, for `lineFits`' `more`. */
  static unit(spot: UnitSpot, direction: PanelDirection): Standing {
    return { rect: unitBorder(spot, direction), node: spot };
  }
}

/** A unit to stand, by id. */
export interface UnitToStand extends UnitSpot {
  id: string;
}

/**
 * Stand every unit in `units` on `floor` (each the first of its `ways` that
 * fits, backing up when a later one can't), with every line on the floor
 * still fitting at the end. Returns each unit's way and the floor with them
 * on it, or null; `floor` itself is untouched.
 */
export function standUnits(
  floor: Floor,
  units: readonly UnitToStand[],
  ways: (unit: UnitToStand) => readonly PanelDirection[] = () => ['x', 'z'],
): { floor: Floor; ways: Map<string, PanelDirection> } | null {
  const go = (i: number, f: Floor): { floor: Floor; ways: Map<string, PanelDirection> } | null => {
    if (i === units.length) return f.linesFit() ? { floor: f, ways: new Map() } : null;
    for (const d of ways(units[i])) {
      if (!f.canStand(units[i], d)) continue;
      const next = f.fork();
      next.addUnit(units[i], d);
      const done = go(i + 1, next);
      if (done) {
        done.ways.set(units[i].id, d);
        return done;
      }
    }
    return null;
  };
  return go(0, floor);
}
