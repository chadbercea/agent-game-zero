import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { distanceToPolyline } from '../primitives/branch/gridPath';
import { busRoutes } from './busRoute';
import { GRID } from './grid';
import { scatterSpots } from './scatter';

const origin = new Vector3(2, 0, 2);

describe('scatterSpots', () => {
  for (const [count, seed] of [[3, 1], [3, 7], [4, 2], [4, 99]] as const) {
    it(`lays out ${count} nodes cleanly (seed ${seed})`, () => {
      const spots = scatterSpots(origin, count, { seed });
      expect(spots).toHaveLength(count);
      for (const p of spots) {
        expect(Number.isInteger(p.x / GRID) && Number.isInteger(p.z / GRID)).toBe(true);
        expect(p.x).toBeLessThan(origin.x);
        expect(p.z).toBeLessThan(origin.z);
        // Tight to the gate: never more than a few steps out.
        expect(origin.x - p.x + origin.z - p.z).toBeLessThanOrEqual(2 * (2 + 1.1 * count));
      }
      spots.forEach((a, i) =>
        spots.forEach((b, j) => {
          if (i >= j) return;
          expect(a.distanceTo(b)).toBeGreaterThanOrEqual(2);
          expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(1);
          expect(Math.abs(a.z - b.z)).toBeGreaterThanOrEqual(1);
        }),
      );
      const routes = busRoutes(origin, spots);
      spots.forEach((p, i) =>
        routes.forEach((r, j) => i !== j && expect(distanceToPolyline(p.x, p.z, r)).toBeGreaterThanOrEqual(1)),
      );
      const depths = spots.map((p) => p.x + p.z);
      expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThanOrEqual(2.5);
      const across = spots.map((p) => p.x - p.z);
      expect(Math.max(...across) - Math.min(...across)).toBeGreaterThanOrEqual(2);
    });
  }

  it('is deterministic per seed', () => {
    expect(scatterSpots(origin, 4, { seed: 5 })).toEqual(scatterSpots(origin, 4, { seed: 5 }));
  });
});

describe('scatterSpots with a set bus axis', () => {
  it('keeps traces clear on either bus', () => {
    for (const bus of ['x', 'z'] as const) {
      const spots = scatterSpots(origin, 4, { seed: 3, bus });
      const routes = busRoutes(origin, spots, GRID, bus);
      spots.forEach((p, i) =>
        routes.forEach((r, j) => i !== j && expect(distanceToPolyline(p.x, p.z, r)).toBeGreaterThanOrEqual(1)),
      );
    }
  });
});
