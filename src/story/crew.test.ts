import { describe, expect, it } from 'vitest';
import { inRun } from '../core/sharedRuns';
import { SYSTEM_KINDS } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { graphPathKinds, viaGateway } from './crew';
import { D3V1N_REACH, graphLines, REWORK, reachRoute, type ReworkScene } from './rework';
import { TeamworkGraph } from './TeamworkGraph';

function scene(): ReworkScene {
  const stage = { onTick: () => () => {}, add: () => {} } as unknown as SceneHost;
  const nodes = Object.fromEntries(
    SYSTEM_KINDS.map((kind) => [kind, { kind, position: REWORK.nodes[kind] } as unknown as SystemNode]),
  ) as ReworkScene['nodes'];
  const graph = new TeamworkGraph(stage, [SYSTEM_KINDS.map((k) => nodes[k])], { highways: false, lines: graphLines() });
  const reach = Object.fromEntries(D3V1N_REACH.map((k) => [k, { line: null, route: reachRoute(k) }])) as unknown as ReworkScene['reach'];
  return { nodes, reach, graph, gateway: null as never };
}

describe('crew routes', () => {
  it('every tool is reachable over the graph from Jira', () => {
    const { graph } = scene();
    for (const kind of SYSTEM_KINDS) {
      const path = graphPathKinds(graph, 'jira', kind);
      expect(path?.[0]).toBe('jira');
      expect(path?.at(-1)).toBe(kind);
    }
  });

  it("D3V1N's sub-agents reach its own tools directly, and everything else through the secure gateway", () => {
    const s = scene();
    for (const kind of SYSTEM_KINDS) {
      const route = viaGateway(s, kind);
      const points = Array.from({ length: 401 }, (_, i) => route.getPointAt(i / 400));
      expect(points[0].distanceTo(REWORK.d3v1n)).toBeLessThan(1e-3);
      expect(points.at(-1)!.distanceTo(REWORK.nodes[kind])).toBeLessThan(0.75);
      const throughGateway = points.some((p) => inRun(REWORK.gateway, p));
      expect({ kind, throughGateway }).toEqual({ kind, throughGateway: kind !== 'github' });
    }
  });
});
