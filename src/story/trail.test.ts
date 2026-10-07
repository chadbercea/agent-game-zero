import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BEND_RADIUS } from '../core/grid';
import { inRun } from '../core/sharedRuns';
import { roundedPath } from '../primitives/branch/gridPath';
import { ATLASSIAN_KINDS, JOB_KINDS, type SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { GATEWAY, storyLayout } from './layout';
import { TeamworkGraph } from './TeamworkGraph';
import { trailLegs } from './trail';
import type { TwoActScene } from './twoActs';

/** The story's two maps and graph, without a renderer: nodes stand where the layout puts them. */
function setup() {
  const stage = { onTick: () => () => {}, add: () => {} } as unknown as SceneHost;
  const {
    maps: [m1, m2],
    lines,
    feeders,
  } = storyLayout();
  const nodes = (kinds: readonly string[], spots: Vector3[]) =>
    kinds.map((kind, i) => ({ kind, position: spots[i] }) as unknown as SystemNode);
  const [n1, n2] = [nodes(JOB_KINDS, m1.spots), nodes(ATLASSIAN_KINDS, m2.spots)];
  const graph = new TeamworkGraph(stage, [n1, n2], { lines, feeders, gateway: GATEWAY, highways: false });
  const map = (ns: SystemNode[], routes: Vector3[][]) => ({ nodes: ns, routes: routes.map((r) => roundedPath(r, BEND_RADIUS)) });
  const scene = { act1: { map: map(n1, m1.routes) }, act2: { map: map(n2, m2.routes) } } as unknown as Pick<
    TwoActScene,
    'act1' | 'act2'
  >;
  return { scene, graph };
}

const ALL: SystemKind[] = ['figma', 'github', 'notion', 'confluence', 'jira'];
const throughGateway = (route: { getPoints: (n: number) => Vector3[] }) =>
  route.getPoints(200).some((p) => inRun(GATEWAY, p));

describe('trailLegs', () => {
  it("reaches every one of DEMO-1's sources: D3V1N's own tools directly, Atlassian's across the graph through the gateway", () => {
    const { scene, graph } = setup();
    const legs = trailLegs(scene, graph, ALL);
    expect(new Set(legs.map((l) => l.to))).toEqual(new Set(ALL));
    const across = legs.filter((l) => l.to === 'confluence' || l.to === 'jira');
    expect(across).toHaveLength(2);
    for (const leg of across) expect(throughGateway(leg.route)).toBe(true);
    for (const leg of legs.filter((l) => !across.includes(l))) expect(throughGateway(leg.route)).toBe(false);
  });

  it("Act 1's trail stops at its own gate's tools; the links it never had are the difference", () => {
    const { scene, graph } = setup();
    const had = trailLegs(scene, graph, ['figma', 'github', 'notion']);
    const all = trailLegs(scene, graph, ALL);
    expect(had.map((l) => l.to).sort()).toEqual(['figma', 'github', 'notion']);
    const gaps = all.filter((l) => !had.some((h) => h.route === l.route));
    expect(gaps.map((l) => l.to).sort()).toEqual(['confluence', 'jira']);
  });

  it('draws each stretch once, even when two sources share it', () => {
    const { scene, graph } = setup();
    const legs = trailLegs(scene, graph, ALL);
    expect(new Set(legs.map((l) => l.route)).size).toBe(legs.length);
  });
});
