import { type Curve, MathUtils, Vector3 } from 'three';
import { BEND_RADIUS, snapToGrid } from '../core/grid';
import { distanceToPolyline, roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { GraphEdge } from '../primitives/graph/GraphEdge';
import type { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { tween, wait } from './timeline';

/**
 * Which nodes the Teamwork Graph links, worked out from where they sit rather
 * than fixed: a minimum spanning tree over grid (Manhattan) distance so every
 * node is connected by the shortest total wiring, plus each node's nearest
 * unlinked neighbour (so no node hangs off a single edge), plus enough of the
 * shortest cross-cluster pairs that the systems are joined at least
 * `crossLinks` times. Short links between neighbours keep the web compact.
 */
export function graphLinks(groups: readonly (readonly Vector3[])[], crossLinks = 2): [number, number][] {
  const points = groups.flat();
  const group = groups.flatMap((g, gi) => g.map(() => gi));
  const dist = (i: number, j: number) => Math.abs(points[i].x - points[j].x) + Math.abs(points[i].z - points[j].z);
  const pairs: [number, number][] = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) pairs.push([i, j]);
  pairs.sort((p, q) => dist(...p) - dist(...q));

  const links: [number, number][] = [];
  const has = (i: number, j: number) => links.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
  // Minimum spanning tree (Kruskal).
  const root = points.map((_, i) => i);
  const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  for (const [i, j] of pairs) {
    if (find(i) !== find(j)) {
      root[find(i)] = find(j);
      links.push([i, j]);
    }
  }
  // Leaves get a second link to their nearest unlinked neighbour.
  const degree = (i: number) => links.filter(([a, b]) => a === i || b === i).length;
  points.forEach((_, i) => {
    if (degree(i) > 1) return;
    const next = pairs.find(([a, b]) => (a === i || b === i) && !has(a, b));
    if (next) links.push(next);
  });
  // The systems join in more than one place.
  const crossing = () => links.filter(([a, b]) => group[a] !== group[b]).length;
  for (const [i, j] of pairs) {
    if (crossing() >= crossLinks) break;
    if (group[i] !== group[j] && !has(i, j)) links.push([i, j]);
  }
  return links;
}

const DRAW_SECONDS = 1.1;
const STAGGER_SECONDS = 0.28;
/** Edges stop just short of node pads so their ports sit at the pad edge. */
const NODE_INSET = 0.62;
/** How far an edge keeps from node pads it doesn't connect. */
const NODE_CLEARANCE = 0.9;

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
 * else, drawn as a solid ribbon so it reads apart from the dotted access traces.
 */
export class TeamworkGraph {
  readonly links: GraphLink[] = [];

  /** `groups`: the nodes behind each gate, one cluster per system. */
  constructor(stage: SceneHost, groups: readonly (readonly SystemNode[])[]) {
    const nodes = groups.flat();
    graphLinks(groups.map((g) => g.map((n) => n.position))).forEach(([a, b]) => {
      const [from, to] = [nodes[a], nodes[b]];
      const others = nodes.filter((n) => n !== from && n !== to).map((n) => n.position);
      const polyline = graphRoute(from.position, to.position, others);
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
 * along the other. Of the two possible corners it takes one whose route keeps
 * clear of the other nodes' pads; when both do (or neither), the one behind
 * (higher on screen), so the graph tends to sit back of the access traces.
 */
export function graphRoute(a: Vector3, b: Vector3, obstacles: readonly Vector3[] = []): Vector3[] {
  const from = snapToGrid(a);
  const to = snapToGrid(b);
  const route = (corner: Vector3) => {
    const points = [from, corner, to].filter((p, i, all) => i === 0 || p.distanceTo(all[i - 1]) > 1e-6);
    return points.length >= 2 ? points : [from, to];
  };
  const clearance = (points: Vector3[]) =>
    Math.min(Infinity, ...obstacles.map((o) => distanceToPolyline(o.x, o.z, points)));
  // Screen "up" (away from the camera) is −X−Z: try the corner behind first.
  const corners = [new Vector3(to.x, 0, from.z), new Vector3(from.x, 0, to.z)].sort((p, q) => p.x + p.z - (q.x + q.z));
  const [behind, front] = corners.map(route);
  if (clearance(behind) >= NODE_CLEARANCE || clearance(behind) >= clearance(front)) return behind;
  return front;
}
