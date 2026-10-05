import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { distanceToPolyline, roundedPath } from '../primitives/branch/gridPath';
import { busRoutes } from './busRoute';
import { GRID } from './grid';

const v = (x: number, z: number) => new Vector3(x, 0, z);
const length = (pts: Vector3[]) => pts.slice(1).reduce((sum, p, i) => sum + p.distanceTo(pts[i]), 0);

// The system map's layout: gate at (2, 2), nodes left / middle / right up the screen.
const gate = v(2, 2);
const nodes = [v(-7, -1), v(-4, -4), v(-1, -7)];
const routes = busRoutes(gate, nodes);

describe('busRoutes', () => {
  it('ends every trace at its target, running only along grid axes', () => {
    routes.forEach((route, i) => {
      expect(route[0].distanceTo(gate)).toBe(0);
      expect(route[route.length - 1].distanceTo(nodes[i])).toBe(0);
      for (let k = 0; k < route.length - 1; k++) {
        expect(route[k].x === route[k + 1].x || route[k].z === route[k + 1].z).toBe(true);
      }
    });
  });

  it('keeps every trace shortest: Manhattan distance, plus at most a lane jog out and back', () => {
    routes.forEach((route, i) => {
      const manhattan = Math.abs(nodes[i].x - gate.x) + Math.abs(nodes[i].z - gate.z);
      expect(length(route)).toBeLessThanOrEqual(manhattan + 2 * GRID + 1e-9);
    });
  });

  it('turns only once after leaving the gate (a single peel-off)', () => {
    for (const route of routes) expect(route).toHaveLength(4); // origin, lane start, turn, target
  });

  it('runs every trace in parallel along one bus until the first peel-off', () => {
    const busAxisIsX = routes.every((r) => r[1].z === r[2].z && r[1].x !== r[2].x);
    expect(busAxisIsX).toBe(true);
    const lanes = routes.map((r) => r[1].z).sort((a, b) => a - b);
    // Adjacent lanes, one grid line apart.
    for (let k = 1; k < lanes.length; k++) expect(lanes[k] - lanes[k - 1]).toBeCloseTo(GRID, 9);
  });

  it('gives the outermost lane on the turn side to the trace that peels off first', () => {
    // The right node needs the least −X travel, so it peels first, turning toward −Z.
    const laneOf = (i: number) => routes[i][1].z;
    expect(laneOf(2)).toBeLessThan(laneOf(1));
    expect(laneOf(1)).toBeLessThan(laneOf(0));
  });

  it('never crosses or touches another trace once out of the gate', () => {
    for (let i = 0; i < routes.length; i++) {
      for (let j = 0; j < routes.length; j++) {
        if (i === j) continue;
        const path = roundedPath(routes[i], 0.35);
        const total = path.getLength();
        for (let k = 0; k <= 200; k++) {
          const p = path.getPointAt(k / 200);
          if (k / 200 < 1.2 / total) continue; // still under the gate pad
          expect(distanceToPolyline(p.x, p.z, routes[j])).toBeGreaterThan(GRID * 0.6);
        }
      }
    }
  });

  it('picks the axis with the longer shared run for the bus', () => {
    // Targets that all need a long −Z run but little −X: the bus should run along Z.
    const tall = busRoutes(v(0, 0), [v(-1, -8), v(-3, -9)]);
    for (const route of tall) expect(route[1].x === route[2].x && route[1].z !== route[2].z).toBe(true);
  });
});
