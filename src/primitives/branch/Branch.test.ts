import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GRID } from '../../core/grid';
import { gridRoute } from '../../story/SystemMap';
import { Branch } from './Branch';
import { distanceToPolyline, roundedPath, trimPolyline } from './gridPath';

const v = (x: number, z: number) => new Vector3(x, 0, z);

describe('grid routes', () => {
  const origin = v(2, 2);
  const routes = [-1, 0, 1].map((slot) => gridRoute(origin, slot, 6, 3));

  it('run only along the grid axes, on grid lines', () => {
    for (const route of routes) {
      for (let i = 0; i < route.length - 1; i++) {
        const [a, b] = [route[i], route[i + 1]];
        expect(a.x === b.x || a.z === b.z).toBe(true); // axis-aligned
      }
      for (const p of route) {
        expect(Math.abs(p.x / GRID - Math.round(p.x / GRID))).toBeLessThan(1e-9);
        expect(Math.abs(p.z / GRID - Math.round(p.z / GRID))).toBeLessThan(1e-9);
      }
    }
  });

  it('fan nodes out left, middle and right of the gate on screen', () => {
    const ends = routes.map((r) => r[r.length - 1]);
    const screenX = (p: Vector3) => (p.x - p.z) / Math.SQRT2; // screen-right is (1, 0, -1)
    expect(screenX(ends[0])).toBeLessThan(screenX(ends[1]));
    expect(screenX(ends[1])).toBeLessThan(screenX(ends[2]));
    // All sit up and back from the gate (screen-up is −X−Z).
    for (const end of ends) expect(end.x + end.z).toBeLessThan(origin.x + origin.z);
  });

  it('never share a segment', () => {
    // Sample each route and require other routes to stay at least one lane away (except at the gate).
    for (let i = 0; i < routes.length; i++) {
      for (let j = 0; j < routes.length; j++) {
        if (i === j) continue;
        const path = roundedPath(trimPolyline(routes[i], 1.2, 0), 0.35);
        for (let k = 0; k <= 40; k++) {
          const p = path.getPointAt(k / 40);
          expect(distanceToPolyline(p.x, p.z, routes[j])).toBeGreaterThan(GRID * 0.9);
        }
      }
    }
  });
});

describe('roundedPath', () => {
  it('keeps straight runs on the grid and rounds each bend by the radius', () => {
    const path = roundedPath([v(0, 0), v(-4, 0), v(-4, -3)], 0.35);
    expect(path.getPointAt(0).distanceTo(v(0, 0))).toBeLessThan(1e-9);
    expect(path.getPointAt(1).distanceTo(v(-4, -3))).toBeLessThan(1e-9);
    // The corner is cut: no point gets closer than ~0.1 to the sharp corner.
    let nearest = Infinity;
    for (let k = 0; k <= 400; k++) nearest = Math.min(nearest, path.getPointAt(k / 400).distanceTo(v(-4, 0)));
    expect(nearest).toBeGreaterThan(0.08);
    expect(nearest).toBeLessThan(0.35);
  });
});

describe('trimPolyline', () => {
  it('shortens both ends along the segments', () => {
    const out = trimPolyline([v(0, 0), v(-4, 0), v(-4, -3)], 1, 0.5);
    expect(out[0].distanceTo(v(-1, 0))).toBeLessThan(1e-9);
    expect(out[out.length - 1].distanceTo(v(-4, -2.5))).toBeLessThan(1e-9);
  });
});

describe('Branch', () => {
  it('draws from the start outward', () => {
    const branch = new Branch(roundedPath([v(0, 0), v(-4, 0), v(-4, -3)], 0.35), new Color('#888'));
    expect(branch.drawn).toBe(0);
    branch.drawn = 0.5;
    expect(branch.drawn).toBe(0.5);
    branch.drawn = 3;
    expect(branch.drawn).toBe(1);
  });
});
