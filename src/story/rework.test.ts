import { describe, expect, it } from 'vitest';
import { NODE_FOOTPRINT } from '../core/grid';
import { SYSTEM_KINDS } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { D3V1N_REACH, graphLines, linkRoute, REWORK, reachRoute, TICKET_IN_JIRA } from './rework';
import { TeamworkGraph } from './TeamworkGraph';
import { TEAMWORK_LINKS } from './systemLayout';

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

  it("routes every graph link from tool to tool, clear of D3V1N's spot and the ticket", () => {
    const lines = graphLines();
    expect(lines.size).toBe(TEAMWORK_LINKS.length);
    for (const [link, line] of lines) {
      expect(line[0].distanceTo(REWORK.nodes[link.a])).toBeLessThan(1e-6);
      expect(line.at(-1)!.distanceTo(REWORK.nodes[link.b])).toBeLessThan(1e-6);
      // Along the grid: every leg is straight along x or z.
      for (let i = 1; i < line.length; i++) expect(line[i].x === line[i - 1].x || line[i].z === line[i - 1].z).toBe(true);
      const keep = [REWORK.d3v1n, ...(link.a === 'jira' || link.b === 'jira' ? [] : [TICKET_IN_JIRA])];
      for (const o of keep) {
        const near = line.some((p, i) => i > 0 && segmentDistance(line[i - 1], p, o) < 0.7);
        expect(near).toBe(false);
      }
    }
  });

  it('the graph carries Bitbucket\'s work to GitHub through Code search, end to end', () => {
    const stage = { onTick: () => () => {}, add: () => {} } as unknown as SceneHost;
    const nodes = SYSTEM_KINDS.map((kind) => ({ kind, position: REWORK.nodes[kind] }) as unknown as SystemNode);
    const graph = new TeamworkGraph(stage, [nodes], { highways: false, lines: graphLines() });
    const route = linkRoute(graph, 'bitbucket', 'codesearch', 'github');
    expect(route.getPoint(0).distanceTo(REWORK.nodes.bitbucket)).toBeLessThan(1e-3);
    expect(route.getPoint(1).distanceTo(REWORK.nodes.github)).toBeLessThan(1e-3);
    expect(() => linkRoute(graph, 'bitbucket', 'notion')).toThrow();
  });
});

function segmentDistance(p: { x: number; z: number }, q: { x: number; z: number }, o: { x: number; z: number }): number {
  const [dx, dz] = [q.x - p.x, q.z - p.z];
  const len = dx * dx + dz * dz;
  const t = len ? Math.min(1, Math.max(0, ((o.x - p.x) * dx + (o.z - p.z) * dz) / len)) : 0;
  return Math.hypot(p.x + dx * t - o.x, p.z + dz * t - o.z);
}
