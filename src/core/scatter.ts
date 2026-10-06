import { Vector3 } from 'three';
import { distanceToPolyline, trimPolyline } from '../primitives/branch/gridPath';
import { GATE_FOOTPRINT, GRID, snapToGrid } from './grid';

/** A small seeded random generator (mulberry32): same seed, same sequence. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed from a string (e.g. the kinds on a map), so each map gets its own layout. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The one routing rule for every line on the floor: X leg first, then Z leg
 * (a straight line when either leg is zero). Shortest possible on the grid:
 * its length is exactly |Δx| + |Δz|, with at most one bend.
 *
 * Why X first, always, and never chosen per line: the bend's handedness is
 * then fixed by the quadrant alone, sign(Δx·Δz). Lines into opposite
 * quadrants bend the same way; lines into neighbouring quadrants bend
 * opposite ways. A pinwheel (swastika, triskelion, any rotating whorl) needs
 * arms in neighbouring directions to all bend the same way around a center,
 * which this rule makes impossible: whatever the RNG does, no set of these
 * lines can form one. The pattern is mirror-like (about the grid diagonal),
 * never rotational.
 */
export function gridRoute(from: Vector3, to: Vector3): Vector3[] {
  const corner = new Vector3(to.x, 0, from.z);
  const points = [from.clone(), corner, to.clone()].filter((p, i, all) => i === 0 || p.distanceTo(all[i - 1]) > 1e-6);
  return points.length >= 2 ? points : [from.clone(), to.clone()];
}

export interface RadialOptions {
  seed: number;
  /** Closest a node may sit to the gate (clears both pads). */
  near?: number;
  /** Least distance between two nodes. */
  spacing?: number;
  /** Least distance between a node and any line it isn't on. */
  clearance?: number;
  /** Other things on the floor (other gates, home) nodes and lines keep clear of. */
  avoid?: readonly Vector3[];
}

export interface RadialMap {
  spots: Vector3[];
  /** Gate port → node, one per spot (see gridRoute); no two touch. */
  routes: Vector3[][];
}

/** Each leg must be zero or long enough to show past the pads it leaves and enters. */
const MIN_LEG = 1.5;
/** How far a node walks out along one ray before turning to try the next one. */
const RAY_REACH = 1.5;
const MAX_REACH = 10;
/**
 * Ports on the gate's edge, as offsets across a line's first leg: lines that
 * leave the same side of the gate start one lane apart instead of sharing a run.
 */
const PORTS = [0, GRID, -GRID];
/** Lines never touch: every point of one keeps at least a lane from every other. */
const LINE_GAP = GRID - 1e-6;
/**
 * The visible part of a gate line: from the gate pad's edge out. Pads sit square on the grid and every
 * line leaves along an axis from a port inside the pad, so the edge is exactly half a footprint along it.
 */
export const visible = (route: Vector3[]) => trimPolyline(route, GATE_FOOTPRINT / 2, 0);
/** Each node walks out from the gate on its own ray; when a ray is blocked it turns by the golden angle. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/**
 * The drone docked over the gate hovers high, so on screen it covers a column
 * straight up from the gate. Nodes stay out of that column (this half-width
 * across the screen, this far back) so their sub-agents are never hidden behind it.
 */
const DRONE_COLUMN = { halfWidth: 1.25, depth: 5 };
/** A sub-agent working over a node covers a smaller column above that node; no other node may sit in it. */
const SUB_AGENT_COLUMN = { halfWidth: 0.9, depth: 3 };

/**
 * Procedural radial node map. One pass, no searching over whole layouts:
 * for each node, the RNG draws a direction (uniform around the gate, so some
 * nodes share a side and some spread out), and the node takes the first
 * grid point on that ray, walking out from the gate one half-step at a time,
 * where it is as close to the gate as it can be while:
 * - at least `spacing` from every placed node;
 * - its line (gridRoute from a port on the gate, shortest possible) keeps
 *   `clearance` from every other node, and no other line runs within
 *   `clearance` of it;
 * - each leg of its line is zero or long enough to read;
 * - it is out of the screen column above the gate, where the docked drone
 *   would hide its sub-agent (see DRONE_COLUMN);
 * - its line is its own all the way to the gate: it never touches, crosses or
 *   shares a run with another line (no junctions but the gate). Lines leaving
 *   the same side start from neighbouring ports, a lane apart.
 * A blocked ray is tried only a short way out (RAY_REACH) before the node
 * turns by the golden angle to the next ray, so it stays near the gate; only
 * if every turn is blocked close in does the reach widen (bounded). The draw
 * order and directions come from the seed, so every system gets its own
 * shape; same seed, same map.
 */
export function radialMap(origin: Vector3, count: number, options: RadialOptions): RadialMap {
  const random = seededRandom(options.seed);
  const placer = new GatePlacer(origin, options);
  for (let n = 0; n < count; n++) placer.place(goldenTurns(random() * Math.PI * 2));
  return { spots: placer.spots, routes: placer.routes };
}

/** Twelve rays from `start`, each a golden angle on from the last: spread evenly, never repeating. */
export function goldenTurns(start: number): number[] {
  return Array.from({ length: 12 }, (_, i) => start + i * GOLDEN_ANGLE);
}

/**
 * Places nodes around one gate, one at a time, by the radialMap rules. Each
 * `place` call tries its rays in order, walking out along each from the gate
 * a half-step at a time (only a short way, RAY_REACH, before moving on to the
 * next ray; the reach widens only if every ray is blocked close in), and
 * takes the first spot that fits. `extra` adds conditions from outside this
 * gate (e.g. graph links to nodes elsewhere).
 */
export class GatePlacer {
  readonly center: Vector3;
  readonly spots: Vector3[] = [];
  readonly routes: Vector3[][] = [];
  private readonly near: number;
  private readonly spacing: number;
  private readonly clearance: number;
  private readonly avoid: readonly Vector3[];

  constructor(origin: Vector3, options: Omit<RadialOptions, 'seed'> = {}) {
    this.center = snapToGrid(origin);
    this.near = options.near ?? 2.5;
    this.spacing = options.spacing ?? 2;
    this.clearance = options.clearance ?? 1;
    this.avoid = options.avoid ?? [];
  }

  place(rays: readonly number[], extra: (spot: Vector3, route: Vector3[]) => boolean = () => true): Vector3 {
    const spot = this.tryPlace(rays, extra);
    if (!spot) throw new Error(`GatePlacer: no room for node ${this.spots.length + 1}`);
    return spot;
  }

  /** Like `place`, but only out to `maxReach` past the nearest ring; null (nothing placed) if nothing fits. */
  tryPlace(
    rays: readonly number[],
    extra: (spot: Vector3, route: Vector3[]) => boolean = () => true,
    maxReach = MAX_REACH,
  ): Vector3 | null {
    const { center, near } = this;
    for (let reach = RAY_REACH; reach <= maxReach; reach += RAY_REACH) {
      for (const angle of rays) {
        for (let r = near; r <= near + reach; r += GRID / 2) {
          const spot = snapToGrid(new Vector3(center.x + Math.cos(angle) * r, 0, center.z + Math.sin(angle) * r));
          const route = this.linesTo(spot).find((line) => this.fits(spot, line) && extra(spot, line));
          if (route) {
            this.spots.push(spot);
            this.routes.push(route);
            return spot;
          }
        }
      }
    }
    return null;
  }

  private fits(spot: Vector3, route: Vector3[]): boolean {
    const { center, spots, routes, spacing, clearance } = this;
    if (!legsReadable(route)) return false;
    if (inDroneColumn(spot.x - center.x, spot.z - center.z)) return false;
    if (spots.some((s) => s.distanceTo(spot) < spacing)) return false;
    if (spots.some((s) => screenStacked(s, spot))) return false;
    if (spots.some((s) => distanceToPolyline(s.x, s.z, route) < clearance)) return false;
    if (routes.some((r) => distanceToPolyline(spot.x, spot.z, r) < clearance)) return false;
    if (!routes.every((r) => apart(route, r))) return false;
    return this.avoid.every((a) => a.distanceTo(spot) >= spacing && distanceToPolyline(a.x, a.z, route) >= clearance);
  }

  /**
   * The node's line from each port on the gate, in port order. The first leg runs along X unless
   * the node is straight down Z, so ports offset across it: along Z for an X leg, along X for a Z leg.
   */
  private linesTo(spot: Vector3): Vector3[][] {
    const { center } = this;
    const alongX = Math.abs(spot.x - center.x) > 1e-6;
    return PORTS.map((o) => gridRoute(center.clone().add(alongX ? new Vector3(0, 0, o) : new Vector3(o, 0, 0)), spot));
  }
}

const legsReadable = (route: Vector3[]) =>
  route.slice(1).every((p, i) => p.distanceTo(route[i]) >= MIN_LEG || p.distanceTo(route[i]) < 1e-6);

/** Every point of one gate line, beyond the gate pad, keeps at least a lane from the other. */
function apart(route: Vector3[], other: Vector3[]): boolean {
  // Only what's drawn counts: each line from where it leaves the gate pad's edge.
  const [mine, theirs] = [visible(route), visible(other)];
  for (let i = 1; i < mine.length; i++) {
    const [a, b] = [mine[i - 1], mine[i]];
    const steps = Math.ceil(a.distanceTo(b) / (GRID / 4));
    for (let s = 0; s <= steps; s++) {
      const p = a.clone().lerp(b, s / steps);
      if (distanceToPolyline(p.x, p.z, theirs) < LINE_GAP) return false;
    }
  }
  return true;
}

/**
 * Whether a floor offset from the gate sits in the docked drone's screen
 * column: across the screen is (Δx − Δz)/√2, and back (up the screen) is
 * −(Δx + Δz)/√2, for the isometric camera.
 */
export function inDroneColumn(dx: number, dz: number, column = DRONE_COLUMN): boolean {
  const across = (dx - dz) / Math.SQRT2;
  const back = -(dx + dz) / Math.SQRT2;
  return Math.abs(across) < column.halfWidth && back > 0 && back < column.depth;
}

/** Two nodes stack on screen: either sits in the column the other's sub-agent covers. */
export function screenStacked(a: Vector3, b: Vector3): boolean {
  return inDroneColumn(b.x - a.x, b.z - a.z, SUB_AGENT_COLUMN) || inDroneColumn(a.x - b.x, a.z - b.z, SUB_AGENT_COLUMN);
}

/**
 * Which way a line leaving `center` turns, and into which quadrant: lines
 * with a bend have a handedness (+1 / −1: the sign of first leg × second
 * leg); straight lines have none.
 */
function armTurn(center: Vector3, arm: readonly Vector3[]): { quadrant: string; hand: number } | null {
  const line = arm[0].distanceTo(center) < arm[arm.length - 1].distanceTo(center) ? arm : [...arm].reverse();
  if (line.length < 3) return null;
  const [a, b, c] = line;
  const hand = Math.sign((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x));
  const end = line[line.length - 1];
  return hand ? { quadrant: `${Math.sign(end.x - center.x)},${Math.sign(end.z - center.z)}`, hand } : null;
}

/**
 * The no-pinwheel rule, checked directly: among the lines that leave one
 * point (a gate or a node), no three bent ones in different quadrants may
 * turn the same way. A swastika is four such arms and a triskelion three,
 * so neither can appear around any point, whatever the seed did.
 */
export function pinwheelFree(center: Vector3, arms: readonly (readonly Vector3[])[]): boolean {
  const quadrants = new Map<number, Set<string>>();
  for (const arm of arms) {
    const turn = armTurn(center, arm);
    if (!turn) continue;
    const set = quadrants.get(turn.hand) ?? new Set<string>();
    set.add(turn.quadrant);
    quadrants.set(turn.hand, set);
  }
  return [...quadrants.values()].every((set) => set.size < 3);
}
