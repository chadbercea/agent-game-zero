import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { distanceToPolyline } from '../primitives/branch/gridPath';
import { GRID } from './grid';
import { gridRoute, inDroneColumn, radialMap, visible } from './scatter';

const origin = new Vector3(2, 0, 2);
/** Which way a route bends: +1 / −1 by handedness, 0 when straight. */
const handedness = (route: Vector3[]) => {
  if (route.length < 3) return 0;
  const [a, b, c] = route;
  return Math.sign((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x));
};

describe('gridRoute', () => {
  it('is the shortest grid line: |Δx| + |Δz|, at most one bend', () => {
    const route = gridRoute(new Vector3(0, 0, 0), new Vector3(3, 0, -2));
    const length = route.slice(1).reduce((sum, p, i) => sum + p.distanceTo(route[i]), 0);
    expect(length).toBeCloseTo(5);
    expect(route.length).toBeLessThanOrEqual(3);
  });

  it('can never make a pinwheel: neighbouring quadrants always bend opposite ways', () => {
    const o = new Vector3(0, 0, 0);
    const quadrants = [
      [3, 2],
      [-2, 3],
      [-3, -2],
      [2, -3],
    ].map(([x, z]) => handedness(gridRoute(o, new Vector3(x, 0, z))));
    for (let i = 0; i < 4; i++) expect(quadrants[i]).toBe(-quadrants[(i + 1) % 4]);
  });
});

describe('radialMap', () => {
  for (const seed of [1, 2, 3, 7, 42, 99, 1234, 2026]) {
    for (const count of [3, 4]) {
      it(`places ${count} nodes cleanly (seed ${seed})`, () => {
        const { spots, routes } = radialMap(origin, count, { seed });
        expect(spots).toHaveLength(count);
        spots.forEach((p, i) => {
          expect(Number.isInteger(p.x / GRID) && Number.isInteger(p.z / GRID)).toBe(true);
          expect(p.distanceTo(origin)).toBeGreaterThanOrEqual(2.5 - GRID);
          expect(inDroneColumn(p.x - origin.x, p.z - origin.z)).toBe(false);
          spots.forEach((q, j) => j > i && expect(p.distanceTo(q)).toBeGreaterThanOrEqual(2));
          routes.forEach((r, j) => i !== j && expect(distanceToPolyline(p.x, p.z, r)).toBeGreaterThanOrEqual(1));
          // Its own line: starts at a port on the gate, shortest from there, and never touches another line.
          expect(routes[i][0].distanceTo(origin)).toBeLessThanOrEqual(GRID + 1e-9);
          expect(routes[i]).toEqual(gridRoute(routes[i][0], p));
          routes.forEach((r, j) => {
            if (j === i) return;
            const [mine, theirs] = [visible(routes[i]), visible(r)];
            for (let k = 1; k < mine.length; k++)
              for (let t = 0; t <= 1; t += 0.05) {
                const q = mine[k - 1].clone().lerp(mine[k], t);
                expect(distanceToPolyline(q.x, q.z, theirs)).toBeGreaterThanOrEqual(GRID - 1e-6);
              }
          });
        });
      });
    }
  }

  it('is deterministic per seed and different across seeds', () => {
    expect(radialMap(origin, 4, { seed: 5 })).toEqual(radialMap(origin, 4, { seed: 5 }));
    expect(radialMap(origin, 4, { seed: 5 }).spots).not.toEqual(radialMap(origin, 4, { seed: 6 }).spots);
  });
});
