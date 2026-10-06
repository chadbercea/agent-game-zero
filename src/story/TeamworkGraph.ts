import { type Curve, MathUtils, Vector3 } from 'three';
import { BEND_RADIUS, NODE_FOOTPRINT, snapToGrid } from '../core/grid';
import { gridRoute } from '../core/scatter';
import { distanceToPolyline, roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { GraphEdge } from '../primitives/graph/GraphEdge';
import type { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { tween, wait } from './timeline';

/**
 * Which nodes the Teamwork Graph links, worked out from where they sit rather
 * than fixed: the minimum spanning tree over grid (Manhattan) distance, i.e.
 * every node connected by the least total line, and nothing more. Every link
 * is drawn with the same shortest line rule as the branches (gridRoute); a
 * pair whose line would run under a third node or a gate is never linked.
 */
export function graphLinks(points: readonly Vector3[], obstacles: readonly Vector3[] = []): [number, number][] {
  const dist = (i: number, j: number) => Math.abs(points[i].x - points[j].x) + Math.abs(points[i].z - points[j].z);
  const clear = ([i, j]: [number, number]) => {
    const route = gridRoute(points[i], points[j]);
    return (
      points.every((p, k) => k === i || k === j || distanceToPolyline(p.x, p.z, route) >= NODE_CLEARANCE) &&
      obstacles.every((o) => distanceToPolyline(o.x, o.z, route) >= GATE_CLEARANCE)
    );
  };
  const pairs: [number, number][] = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) pairs.push([i, j]);
  pairs.sort((p, q) => dist(...p) - dist(...q));

  // Kruskal: shortest clear pair first, skipping any that would close a loop.
  const links: [number, number][] = [];
  const root = points.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  for (const [i, j] of pairs.filter(clear)) {
    if (find(i) !== find(j)) {
      root[find(i)] = find(j);
      links.push([i, j]);
    }
  }
  return links;
}

const DRAW_SECONDS = 1.1;
const STAGGER_SECONDS = 0.28;
/** Edges stop just short of node pads so their ports sit at the pad edge. */
const NODE_INSET = NODE_FOOTPRINT / 2;
/** How far an edge keeps from node pads it doesn't connect. */
const NODE_CLEARANCE = 0.9;
/** How far an edge keeps from gates. */
const GATE_CLEARANCE = 0.9;

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
 * linking system nodes from every gate (see graphLinks). Each edge is an L-shaped grid route
 * (along the isometric axes, one rounded bend) on the same plane as everything
 * else, drawn as blue marching dots so it reads apart from the still, gray access traces.
 */
export class TeamworkGraph {
  readonly links: GraphLink[] = [];
  private readonly untick: () => void;

  /** `groups`: the nodes around each gate, one cluster per system; `obstacles`: gates, which edges keep clear of. */
  constructor(stage: SceneHost, groups: readonly (readonly SystemNode[])[], obstacles: readonly Vector3[] = []) {
    this.untick = stage.onTick((dt) => this.links.forEach(({ edge }) => edge.update(dt)));
    const nodes = groups.flat();
    graphLinks(
      nodes.map((n) => n.position),
      obstacles,
    ).forEach(([a, b]) => {
      const [from, to] = [nodes[a], nodes[b]];
      const polyline = gridRoute(snapToGrid(from.position), snapToGrid(to.position));
      const edge = new GraphEdge(roundedPath(trimPolyline(polyline, NODE_INSET, NODE_INSET), BEND_RADIUS));
      stage.add(edge);
      this.links.push({
        from,
        to,
        edge,
        route: roundedPath(polyline, BEND_RADIUS),
      });
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
    await tween(stage, seconds, (t) =>
      this.links.forEach(({ edge }, i) => (edge.material.opacity = MathUtils.lerp(start[i], 0, t))),
    );
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
    this.untick();
    for (const { edge } of this.links) edge.dispose();
  }
}
