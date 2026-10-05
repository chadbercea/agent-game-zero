import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GRID } from '../core/grid';
import { graphLinks, graphRoute } from './TeamworkGraph';

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

describe('graphRoute around nodes', () => {
  it('takes the front corner when the one behind runs under another node', () => {
    const a = new Vector3(0, 0, 0);
    const b = new Vector3(-4, 0, -4);
    // Behind corner is (-4, 0, 0); put a node right on that leg.
    const route = graphRoute(a, b, [new Vector3(-2, 0, 0)]);
    expect(route[1].toArray()).toEqual([0, 0, -4]);
  });
});

describe('graphLinks', () => {
  const left = [new Vector3(0, 0, 0), new Vector3(-3, 0, -1), new Vector3(-1, 0, -4)];
  const right = [new Vector3(8, 0, -8), new Vector3(6, 0, -10), new Vector3(9, 0, -12), new Vector3(5, 0, -13)];
  const links = graphLinks([left, right]);

  it('connects every node, each to at least two others', () => {
    for (let i = 0; i < 7; i++) expect(links.filter(([a, b]) => a === i || b === i).length).toBeGreaterThanOrEqual(2);
  });

  it('joins the two systems at least twice', () => {
    expect(links.filter(([a, b]) => (a < 3) !== (b < 3)).length).toBeGreaterThanOrEqual(2);
  });
});
