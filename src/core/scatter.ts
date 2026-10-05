import { Vector3 } from 'three';
import { distanceToPolyline } from '../primitives/branch/gridPath';
import { type Axis, busRoutes } from './busRoute';
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

export interface ScatterOptions {
  seed: number;
  /** Closest a node may sit to the gate, per world axis. */
  near?: number;
  /** Farthest a node may sit from the gate, per world axis. */
  far?: number;
  /** Least distance between two nodes. */
  spacing?: number;
  /** Least clearance between a node and any other node's trace. */
  clearance?: number;
  /**
   * Which axis the traces' shared bus runs along (see busRoutes). Nodes then
   * sit toward the bus's side of the gate, so traces run out and peel off
   * short instead of swinging wide around the cluster.
   */
  bus?: Axis;
}

const MAX_TRIES = 2000;

/**
 * Seeded scattered cluster: `count` node spots behind a gate (up and back on
 * screen, the −X−Z quadrant), loose and uneven rather than in a row, and
 * every one a valid circuit-board target:
 * - on grid points, at least `spacing` apart;
 * - at distinct distances from the gate along both axes (so each trace peels
 *   off the bus on its own grid line);
 * - clear of every other node's trace;
 * - staggered in depth and across on screen (never one row or one column).
 * Same seed, same layout.
 */
export function scatterSpots(origin: Vector3, count: number, options: ScatterOptions): Vector3[] {
  const { seed, near = 2, far = 2 + 1.1 * count, spacing = 2, clearance = 1, bus } = options;
  const random = seededRandom(seed);
  const step = () => near + Math.round((random() * (far - near)) / GRID) * GRID;
  let best: Vector3[] | undefined;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const offsets: [number, number][] = [];
    for (let tries = 0; offsets.length < count && tries < 200; tries++) {
      const candidate: [number, number] = [step(), step()];
      const [along, across] = bus === 'z' ? [candidate[1], candidate[0]] : [candidate[0], candidate[1]];
      if (bus && along < across) continue;
      const fits = offsets.every(
        ([x, z]) =>
          Math.hypot(x - candidate[0], z - candidate[1]) >= spacing &&
          Math.abs(x - candidate[0]) >= 1 &&
          Math.abs(z - candidate[1]) >= 1,
      );
      if (fits) offsets.push(candidate);
    }
    if (offsets.length < count) continue;
    // Staggered: the cluster has real depth and width on screen, never one row or one column.
    const range = (values: number[]) => Math.max(...values) - Math.min(...values);
    if (count > 2 && range(offsets.map(([x, z]) => x + z)) < 2.5) continue;
    if (count > 2 && range(offsets.map(([x, z]) => x - z)) < 2) continue;
    const spots = offsets.map(([x, z]) => snapToGrid(new Vector3(origin.x - x, 0, origin.z - z)));
    const routes = busRoutes(snapToGrid(origin), spots, GRID, bus);
    const clear = spots.every((spot, i) =>
      routes.every((route, j) => i === j || distanceToPolyline(spot.x, spot.z, route) >= clearance),
    );
    if (clear) return spots;
    best ??= spots;
  }
  if (!best) throw new Error(`scatterSpots: no layout for ${count} nodes`);
  return best;
}
