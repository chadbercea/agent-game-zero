import { type Curve, MathUtils, Vector3 } from 'three';
import { BEND_RADIUS, NODE_FOOTPRINT } from '../core/grid';
import { roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { GraphEdge } from '../primitives/graph/GraphEdge';
import type { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { gridRoute } from '../core/scatter';
import { snapToGrid } from '../core/grid';
import { TEAMWORK_LINKS, type TeamworkLink } from './systemLayout';
import { tween, wait } from './timeline';

const DRAW_SECONDS = 1.1;
const STAGGER_SECONDS = 0.28;
/** Edges stop just short of node pads so their ports sit at the pad edge. */
const NODE_INSET = NODE_FOOTPRINT / 2;

/** One link in the graph: its edge, its two endpoints, and the full node-to-node path for handoffs. */
export interface GraphLink {
  from: SystemNode;
  to: SystemNode;
  edge: GraphEdge;
  /** Node center to node center along the edge, for work traveling between them. */
  route: Curve<Vector3>;
  /** The relationship this edge stands for. */
  link: TeamworkLink;
}

/**
 * The Teamwork Graph: a web of grid-routed edges across the whole floor,
 * linking system nodes from every gate along the relationships the graph
 * actually tracks (TEAMWORK_LINKS; the layout keeps them short and clear). Each edge is an L-shaped grid route
 * (along the isometric axes, one rounded bend) on the same plane as everything
 * else, drawn as blue marching dots so it reads apart from the still, gray access traces.
 */
export class TeamworkGraph {
  readonly links: GraphLink[] = [];
  private readonly untick: () => void;

  /**
   * `groups`: the nodes around each gate, one cluster per system. `lines`: each link's floor line as the
   * layout chose it (see layoutSystems); a link without one takes the plain shortest line. Links between
   * systems not on the grid are skipped.
   */
  constructor(
    stage: SceneHost,
    groups: readonly (readonly SystemNode[])[],
    lines: ReadonlyMap<TeamworkLink, Vector3[]> = new Map(),
    links: readonly TeamworkLink[] = TEAMWORK_LINKS,
  ) {
    this.untick = stage.onTick((dt) => this.links.forEach(({ edge }) => edge.update(dt)));
    const byKind = new Map(groups.flat().map((n) => [n.kind, n]));
    links.forEach((link) => {
      const [from, to] = [byKind.get(link.a), byKind.get(link.b)];
      if (!from || !to) return;
      const polyline = lines.get(link) ?? gridRoute(snapToGrid(from.position), snapToGrid(to.position));
      const edge = new GraphEdge(roundedPath(trimPolyline(polyline, NODE_INSET, NODE_INSET), BEND_RADIUS));
      stage.add(edge);
      this.links.push({
        from,
        to,
        edge,
        route: roundedPath(polyline, BEND_RADIUS),
        link,
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
