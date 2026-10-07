import { describe, expect, it } from 'vitest';
import { NODE_FOOTPRINT } from '../core/grid';
import { SYSTEM_KINDS } from '../primitives/node/emblems';
import { D3V1N_REACH, REWORK, reachRoute } from './rework';

describe('Story Rework layout', () => {
  it("D3V1N reaches only Jira and GitHub on its own", () => {
    expect([...D3V1N_REACH].sort()).toEqual(['github', 'jira']);
  });

  it('each access line runs from under D3V1N to the edge of its tool', () => {
    for (const kind of D3V1N_REACH) {
      const route = reachRoute(kind);
      expect(route.getPoint(0).distanceTo(REWORK.d3v1n)).toBeLessThan(1e-6);
      const end = route.getPoint(1);
      const node = REWORK.nodes[kind];
      expect(Math.max(Math.abs(end.x - node.x), Math.abs(end.z - node.z))).toBeCloseTo(NODE_FOOTPRINT / 2, 5);
    }
  });

  it('every tool has its own room on the grid, clear of D3V1N and the ticket', () => {
    const spots = [...SYSTEM_KINDS.map((k) => REWORK.nodes[k]), REWORK.d3v1n, REWORK.ticketSpot];
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) expect(spots[i].distanceTo(spots[j])).toBeGreaterThan(1.4);
    }
  });
});
