import { describe, expect, it } from 'vitest';
import { inRun } from '../core/sharedRuns';
import { ATLASSIAN_KINDS, JOB_KINDS, SYSTEM_KINDS } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { graphPathKinds, linkRoute } from './crew';
import { GATEWAY, storyLayout } from './layout';
import { TeamworkGraph } from './TeamworkGraph';

/** The Teamwork Graph over the two-system scene, on stand-in nodes at the layout's spots. */
function graph(): TeamworkGraph {
  const stage = { onTick: () => () => {}, add: () => {} } as unknown as SceneHost;
  const { maps, lines, feeders } = storyLayout();
  const groups = [JOB_KINDS, ATLASSIAN_KINDS].map((kinds, m) =>
    kinds.map((kind, i) => ({ kind, position: maps[m].spots[i] }) as unknown as SystemNode),
  );
  return new TeamworkGraph(stage, groups, { lines, feeders, gateway: GATEWAY, highways: false });
}

describe('crew routes', () => {
  it('every tool is reachable over the graph from GitHub', () => {
    const g = graph();
    for (const kind of SYSTEM_KINDS) {
      const path = graphPathKinds(g, 'github', kind);
      expect(path?.[0]).toBe('github');
      expect(path?.at(-1)).toBe(kind);
    }
  });

  it("D3V1N's crew reaches Bitbucket only through the secure gateway, end to end", () => {
    const g = graph();
    const route = linkRoute(g, ...graphPathKinds(g, 'github', 'bitbucket')!);
    const points = Array.from({ length: 401 }, (_, i) => route.getPointAt(i / 400));
    const at = (kind: string) => g.links.flatMap((l) => [l.from, l.to]).find((n) => n.kind === kind)!.position;
    expect(points[0].distanceTo(at('github'))).toBeLessThan(1e-3);
    expect(points.at(-1)!.distanceTo(at('bitbucket'))).toBeLessThan(1e-3);
    expect(points.some((p) => inRun(GATEWAY, p))).toBe(true);
    expect(() => linkRoute(g, 'bitbucket', 'notion')).toThrow();
  });
});
