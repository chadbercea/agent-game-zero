import { type Curve, MathUtils, Vector3 } from 'three';
import { BEND_RADIUS, GATE_FOOTPRINT, NODE_FOOTPRINT } from '../core/grid';
import { inRun, runsOverlap, type SharedRun, sharedRuns } from '../core/sharedRuns';
import { Conduit } from '../primitives/conduit/Conduit';
import { roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { GRAPH_COLOR, GraphEdge } from '../primitives/graph/GraphEdge';
import type { Boost } from './beam';
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
const CONDUIT_SECONDS = 1.2;

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
export interface TeamworkGraphOptions {
  /** Each link's floor line as the layout chose it (see layoutSystems); a link without one takes the plain shortest line. */
  lines?: ReadonlyMap<TeamworkLink, Vector3[]>;
  links?: readonly TeamworkLink[];
  /** The gates' own lines to their nodes: where graph links run alongside them, that's a highway too. */
  gateLines?: readonly (readonly Vector3[])[];
  /** Gate centers, so highways stop at the gate pads. */
  gates?: readonly Vector3[];
  /** Runs already spoken for (the secure gateway): no plain highway overlaps them. */
  reserved?: readonly SharedRun[];
}

export class TeamworkGraph {
  readonly links: GraphLink[] = [];
  /** Information highways: glass conduits over every shared run (see sharedRuns). */
  readonly conduits: Conduit[] = [];
  private readonly untick: () => void;

  /**
   * `groups`: the nodes around each gate, one cluster per system. Links between systems not on the grid
   * are skipped. Wherever lines share a run (graph links with each other, or with gate lines), a conduit
   * encloses it.
   */
  constructor(stage: SceneHost, groups: readonly (readonly SystemNode[])[], options: TeamworkGraphOptions = {}) {
    const { lines = new Map(), links = TEAMWORK_LINKS, gateLines = [], gates = [], reserved = [] } = options;
    this.untick = stage.onTick((dt) => {
      for (const { edge } of this.links) edge.update(dt);
      for (const conduit of this.conduits) conduit.update(dt);
    });
    const byKind = new Map(groups.flat().map((n) => [n.kind, n]));
    const polylines: Vector3[][] = [];
    links.forEach((link) => {
      const [from, to] = [byKind.get(link.a), byKind.get(link.b)];
      if (!from || !to) return;
      const polyline = lines.get(link) ?? gridRoute(snapToGrid(from.position), snapToGrid(to.position));
      polylines.push(polyline);
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

    const keepouts = [
      ...[...byKind.values()].map((n) => ({ center: n.position, half: NODE_FOOTPRINT / 2 })),
      ...gates.map((g) => ({ center: g, half: GATE_FOOTPRINT / 2 })),
    ];
    // Only runs a graph link takes part in: gate lines alongside each other never meet (each node has its own).
    const all = [...polylines, ...gateLines];
    for (const run of sharedRuns(all, keepouts).filter((r) => !reserved.some((g) => runsOverlap(r, g)))) {
      const conduit = new Conduit(run);
      stage.add(conduit);
      this.conduits.push(conduit);
    }
  }

  /** Whether a floor point is inside an information highway (packets there ride faster and glow). */
  inHighway(p: Vector3): boolean {
    return this.conduits.some((c) => c.level > 0.5 && inRun(c.run, p));
  }

  /** Packets in a highway ride this much faster, glowing the graph's blue. */
  readonly boost: Boost = { at: (p) => this.inHighway(p), speed: 2.2, glow: GRAPH_COLOR };

  /** Draw the web in, edge after edge; the highways rise as it completes. */
  async reveal(stage: Pick<SceneHost, 'onTick'>): Promise<void> {
    await Promise.all([
      ...this.links.map(async ({ edge }, i) => {
        await wait(stage, i * STAGGER_SECONDS);
        await tween(stage, DRAW_SECONDS, (t) => (edge.drawn = 1 - (1 - t) ** 3));
      }),
      (async () => {
        await wait(stage, this.links.length * STAGGER_SECONDS * 0.6);
        await tween(stage, CONDUIT_SECONDS, (t) => this.conduits.forEach((c) => (c.level = t * t * (3 - 2 * t))));
      })(),
    ]);
  }

  /** Fade the whole web out and reset it. */
  async fade(stage: Pick<SceneHost, 'onTick'>, seconds = 0.8): Promise<void> {
    const start = this.links.map(({ edge }) => edge.material.opacity);
    await tween(stage, seconds, (t) => {
      this.links.forEach(({ edge }, i) => (edge.material.opacity = MathUtils.lerp(start[i], 0, t)));
      for (const c of this.conduits) c.level = Math.min(c.level, 1 - t);
    });
    this.hide();
    this.links.forEach(({ edge }, i) => (edge.material.opacity = start[i]));
  }

  /** Undrawn, invisible. */
  hide(): void {
    for (const { edge } of this.links) edge.drawn = 0;
    for (const c of this.conduits) c.level = 0;
  }

  /** Fully drawn at once (specimens). */
  showAll(): void {
    for (const { edge } of this.links) edge.drawn = 1;
    for (const c of this.conduits) c.level = 1;
  }

  dispose(): void {
    this.untick();
    for (const { edge } of this.links) edge.dispose();
    for (const c of this.conduits) c.dispose();
  }
}
