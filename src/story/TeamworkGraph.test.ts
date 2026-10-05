import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GRID } from '../core/grid';
import { graphRoute } from './TeamworkGraph';

describe('graphRoute', () => {
  it('is an L on grid lines, cornering behind the two nodes', () => {
    const a = new Vector3(-1, 0, -7);
    const b = new Vector3(2.25, 0, -10.25);
    const route = graphRoute(a, b);
    expect(route).toHaveLength(3);
    for (let i = 1; i < route.length; i++) {
      const [p, q] = [route[i - 1], route[i]];
      expect(p.x === q.x || p.z === q.z).toBe(true);
    }
    for (const p of route) {
      expect(Math.abs(p.x / GRID - Math.round(p.x / GRID))).toBeLessThan(1e-9);
      expect(Math.abs(p.z / GRID - Math.round(p.z / GRID))).toBeLessThan(1e-9);
      expect(p.y).toBe(0);
    }
    const [from, corner, to] = route;
    expect(corner.x + corner.z).toBeLessThan(Math.min(from.x + from.z, to.x + to.z));
  });

  it('is a straight run when the nodes share a grid line', () => {
    expect(graphRoute(new Vector3(0, 0, 0), new Vector3(0, 0, -4))).toHaveLength(2);
  });
});
