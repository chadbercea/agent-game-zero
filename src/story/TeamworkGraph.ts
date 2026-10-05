import { type Curve, MathUtils, Vector3 } from 'three';
import { BEND_RADIUS, snapToGrid } from '../core/grid';
import { roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { GraphEdge } from '../primitives/graph/GraphEdge';
import type { SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { tween, wait } from './timeline';

/**
 * Which systems the Teamwork Graph links. The Atlassian tools connect to each
 * other and to the Act 1 tools: it already knows every node on the grid.
 */
export const GRAPH_LINKS: readonly [SystemKind, SystemKind][] = [
  ['jira', 'bitbucket'],
  ['jira', 'confluence'],
  ['bitbucket', 'codesearch'],
  ['confluence', 'codesearch'],
  ['jira', 'figma'],
  ['bitbucket', 'github'],
  ['codesearch', 'github'],
  ['confluence', 'notion'],
];

const DRAW_SECONDS = 1.1;
const STAGGER_SECONDS = 0.28;
/** Edges stop just short of node pads so their ports sit at the pad edge. */
const NODE_INSET = 0.62;

/** One link in the graph: its edge, its two endpoints, and the full node-to-node path for handoffs. */
export interface GraphLink {
  from: SystemNode;
  to: SystemNode;
  edge: GraphEdge;
  /** Node center to node center along the edge, for work traveling between them. */
  route: Curve<Vector3>;
}

/**
 * The Teamwork Graph: a web of grid-routed edges across the whole floor,
 * linking system nodes from every gate. Each edge is an L-shaped grid route
 * (along the isometric axes, one rounded bend) on the same plane as everything
 * else, drawn as a solid ribbon so it reads apart from the dotted access traces.
 */
export class TeamworkGraph {
  readonly links: GraphLink[] = [];

  constructor(stage: SceneHost, nodes: readonly SystemNode[], links: readonly [SystemKind, SystemKind][] = GRAPH_LINKS) {
    const byKind = new Map(nodes.map((n) => [n.kind, n]));
    links.forEach(([a, b]) => {
      const from = byKind.get(a);
      const to = byKind.get(b);
      if (!from || !to) return;
      const polyline = graphRoute(from.position, to.position);
      const edge = new GraphEdge(roundedPath(trimPolyline(polyline, NODE_INSET, NODE_INSET), BEND_RADIUS));
      stage.add(edge);
      this.links.push({ from, to, edge, route: roundedPath(polyline, BEND_RADIUS) });
    });
  }

  /** Draw the web in, edge after edge. */
  async reveal(stage: Pick<SceneHost, 'onTick'>): Promise<void> {
    await Promise.all(
      this.links.map(async ({ edge }, i) => {
        await wait(stage, i * STAGGER_SECONDS);
        await tween(stage, DRAW_SECONDS, (t) => (edge.drawn = 1 - (1 - t) ** 3));
      }),
    );
  }

  /** Fade the whole web out and reset it. */
  async fade(stage: Pick<SceneHost, 'onTick'>, seconds = 0.8): Promise<void> {
    const start = this.links.map(({ edge }) => edge.material.opacity);
    await tween(stage, seconds, (t) => this.links.forEach(({ edge }, i) => (edge.material.opacity = MathUtils.lerp(start[i], 0, t))));
    this.hide();
    this.links.forEach(({ edge }, i) => (edge.material.opacity = start[i]));
  }

  /** Undrawn, invisible. */
  hide(): void {
    for (const { edge } of this.links) edge.drawn = 0;
  }

  /** Fully drawn at once (specimens). */
  showAll(): void {
    for (const { edge } of this.links) edge.drawn = 1;
  }

  dispose(): void {
    for (const { edge } of this.links) edge.dispose();
  }
}

/**
 * An L-shaped grid route between two node centers: along one axis, one turn,
 * along the other. Of the two possible corners it takes the one behind the
 * nodes (higher on screen), so the graph sits back of the node row and never
 * tangles with the access traces running up to the nodes from the gates.
 */
export function graphRoute(a: Vector3, b: Vector3): Vector3[] {
  const from = snapToGrid(a);
  const to = snapToGrid(b);
  const c1 = new Vector3(to.x, 0, from.z);
  const c2 = new Vector3(from.x, 0, to.z);
  // Screen "up" (away from the camera) is −X−Z.
  const corner = c1.x + c1.z <= c2.x + c2.z ? c1 : c2;
  const points = [from, corner, to].filter((p, i, all) => i === 0 || p.distanceTo(all[i - 1]) > 1e-6);
  return points.length >= 2 ? points : [from, to];
}
