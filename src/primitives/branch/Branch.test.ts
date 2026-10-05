import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Branch } from './Branch';
import { roundedPath, trimPolyline } from './gridPath';

const v = (x: number, z: number) => new Vector3(x, 0, z);

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
