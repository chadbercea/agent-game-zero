import { Vector3 } from 'three';
import { distanceToPolyline } from '../primitives/branch/gridPath';
import { GRID, snapToGrid } from './grid';

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
/** Under the gate pad (lines are drawn from its edge), where every line meets at the gate. */
const GATE_PAD = 1.2;
/** Each node walks out from the gate on its own ray; when a ray is blocked it turns by the golden angle. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

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
  const { seed, near = 2.5, spacing = 2, clearance = 1, avoid = [] } = options;
  const random = seededRandom(seed);
  const center = snapToGrid(origin);
  const spots: Vector3[] = [];
  const routes: Vector3[][] = [];

  const legsReadable = (route: Vector3[]) =>
    route.slice(1).every((p, i) => p.distanceTo(route[i]) >= MIN_LEG || p.distanceTo(route[i]) < 1e-6);
  const fits = (spot: Vector3, route: Vector3[]) => {
    if (!legsReadable(route)) return false;
    if (spots.some((s) => s.distanceTo(spot) < spacing)) return false;
    if (spots.some((s) => distanceToPolyline(s.x, s.z, route) < clearance)) return false;
    if (routes.some((r) => distanceToPolyline(spot.x, spot.z, r) < clearance)) return false;
    if (!routes.every((r) => apart(route, r))) return false;
    return avoid.every((a) => a.distanceTo(spot) >= spacing && distanceToPolyline(a.x, a.z, route) >= clearance);
  };
  // Every point of the new line beyond the gate pad keeps at least a lane from the other line.
  const apart = (route: Vector3[], other: Vector3[]) => {
    for (let i = 1; i < route.length; i++) {
      const [a, b] = [route[i - 1], route[i]];
      const steps = Math.ceil(a.distanceTo(b) / (GRID / 4));
      for (let s = 0; s <= steps; s++) {
        const p = a.clone().lerp(b, s / steps);
        if (p.distanceTo(center) < GATE_PAD) continue;
        if (distanceToPolyline(p.x, p.z, other) < LINE_GAP) return false;
      }
    }
    return true;
  };
  // The node's line from each port on the gate, in port order. The first leg runs along X unless
  // the node is straight down Z, so ports offset across it: along Z for an X leg, along X for a Z leg.
  const linesTo = (spot: Vector3) => {
    const alongX = Math.abs(spot.x - center.x) > 1e-6;
    return PORTS.map((o) => gridRoute(center.clone().add(alongX ? new Vector3(0, 0, o) : new Vector3(o, 0, 0)), spot));
  };

  for (let n = 0; n < count; n++) {
    const start = random() * Math.PI * 2;
    let placed = false;
    for (let reach = RAY_REACH; reach <= MAX_REACH && !placed; reach += RAY_REACH) {
      for (let turn = 0, angle = start; turn < 12 && !placed; turn++, angle += GOLDEN_ANGLE) {
        for (let r = near; r <= near + reach && !placed; r += GRID / 2) {
          const spot = snapToGrid(new Vector3(center.x + Math.cos(angle) * r, 0, center.z + Math.sin(angle) * r));
          const route = linesTo(spot).find((line) => fits(spot, line));
          if (route) {
            spots.push(spot);
            routes.push(route);
            placed = true;
          }
        }
      }
    }
    if (!placed) throw new Error(`radialMap: no room for node ${n + 1} of ${count}`);
  }
  return { spots, routes };
}
