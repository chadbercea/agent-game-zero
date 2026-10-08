import { type Curve, CurvePath, LineCurve3, MathUtils, Vector3 } from 'three';
import { BEND_RADIUS, GATE_FOOTPRINT, GRID, NODE_FOOTPRINT, snapToGrid } from '../core/grid';
import { gridRoute } from '../core/scatter';
import { inRun, runsOverlap, type SharedRun, sharedRuns } from '../core/sharedRuns';
import { reversed, roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { Conduit } from '../primitives/conduit/Conduit';
import { GRAPH_COLOR, GraphEdge } from '../primitives/graph/GraphEdge';
import type { SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import type { Boost } from './beam';
import { TEAMWORK_LINKS, type TeamworkLink } from './systemLayout';
import { tween, wait } from './timeline';

const DRAW_SECONDS = 1.1;
const STAGGER_SECONDS = 0.28;
/** Edges stop just short of node pads so their ports sit at the pad edge. */
const NODE_INSET = NODE_FOOTPRINT / 2;
const CONDUIT_SECONDS = 1.2;

/** One link in the graph: its endpoints, the relationship, and the path work takes between them. */
export interface GraphLink {
  from: SystemNode;
  to: SystemNode;
  /** Node center to node center, for work traveling between them (through the gateway, if it crosses systems). */
  route: Curve<Vector3>;
  /** The relationship this link stands for. */
  link: TeamworkLink;
  /** Whether it crosses between systems (through the secure gateway). */
  crosses: boolean;
}

export interface TeamworkGraphOptions {
  /** Each in-system link's floor line as the layout chose it (see layoutSystems); otherwise the plain shortest line. */
  lines?: ReadonlyMap<TeamworkLink, Vector3[]>;
  /** Feeder lines, tunnel port → node, for every node that talks across systems (see layoutSystems). */
  feeders?: ReadonlyMap<SystemKind, Vector3[]>;
  /** The secure gateway every cross-system link goes through. */
  gateway?: SharedRun;
  links?: readonly TeamworkLink[];
  /** The gates' own lines to their nodes: where graph lines run alongside them, that's a highway too. */
  gateLines?: readonly (readonly Vector3[])[];
  /** Gate centers, so highways stop at the gate pads. */
  gates?: readonly Vector3[];
  /** Enclose shared runs outside the gateway in plain glass highways. Off when the gateway is the only tunnel. */
  highways?: boolean;
}

/**
 * The Teamwork Graph: the relationships it tracks (TEAMWORK_LINKS), drawn as
 * blue marching dots on the floor grid, apart from the still, gray access
 * traces. Links within a system are direct lines between the nodes. Links
 * between systems never skip security: each node that talks across has one
 * feeder line into its side's end of the secure gateway, and work for those
 * links rides feeder → tunnel → feeder. Wherever lines share a run outside
 * the gateway, a plain glass highway encloses it.
 */
export class TeamworkGraph {
  readonly links: GraphLink[] = [];
  /** Every drawn line: in-system links and feeders, each once. */
  readonly edges: GraphEdge[] = [];
  /** Per edge, the tools it touches (a feeder: its one node; a link: both ends). */
  private readonly edgeKinds: SystemKind[][] = [];
  /** Information highways: glass conduits over shared runs (see sharedRuns), never over the gateway. */
  readonly conduits: Conduit[] = [];
  private readonly gateway?: SharedRun;
  private readonly untick: () => void;
  /** The feeder lines into the gateway, with each one's full opacity. */
  private readonly feeders: { edge: GraphEdge; opacity: number }[] = [];
  /** Tunnels fed by those lines (the secure gateway's conduit): their streams flow only while the feeders are connected. */
  private readonly tunnels: { streams: number }[] = [];

  /** `groups`: the nodes around each gate, one cluster per system. Links between systems not on the grid are skipped. */
  constructor(stage: SceneHost, groups: readonly (readonly SystemNode[])[], options: TeamworkGraphOptions = {}) {
    const {
      lines = new Map(),
      feeders = new Map(),
      gateway,
      links = TEAMWORK_LINKS,
      gateLines = [],
      gates = [],
      highways = true,
    } = options;
    this.gateway = gateway;
    this.untick = stage.onTick((dt) => {
      for (const edge of this.edges) edge.update(dt);
      for (const conduit of this.conduits) conduit.update(dt);
      this.capStreams();
    });
    const byKind = new Map(groups.flat().map((n) => [n.kind, n]));
    const system = new Map(groups.flatMap((g, i) => g.map((n) => [n.kind, i] as const)));
    const drawn: Vector3[][] = [];
    const draw = (polyline: Vector3[], insetStart: number, kinds: SystemKind[]) => {
      const edge = new GraphEdge(roundedPath(trimPolyline(polyline, insetStart, NODE_INSET), BEND_RADIUS));
      stage.add(edge);
      this.edges.push(edge);
      this.edgeKinds.push(kinds);
      drawn.push(polyline);
      return edge;
    };

    // Feeders first: from each tunnel port (the line starts right at the end face) out to its node.
    for (const [kind, feeder] of feeders) {
      if (!byKind.size) continue;
      const edge = draw(feeder, 0, [kind]);
      this.feeders.push({ edge, opacity: edge.material.opacity });
    }

    for (const link of links) {
      const [from, to] = [byKind.get(link.a), byKind.get(link.b)];
      if (!from || !to) continue;
      const crosses = system.get(link.a) !== system.get(link.b);
      const [fa, fb] = [feeders.get(link.a), feeders.get(link.b)];
      if (crosses && gateway && fa && fb) {
        // Node → its feeder back to the tunnel → through the tunnel → the far feeder → partner node.
        const route = new CurvePath<Vector3>();
        route.add(reversed(roundedPath(fa, BEND_RADIUS)));
        for (const leg of tunnelLegs(fa[0], fb[0], gateway)) route.add(leg);
        route.add(roundedPath(fb, BEND_RADIUS));
        this.links.push({ from, to, route, link, crosses });
        continue;
      }
      const polyline = lines.get(link) ?? gridRoute(snapToGrid(from.position), snapToGrid(to.position));
      draw(polyline, NODE_INSET, [link.a, link.b]);
      this.links.push({ from, to, route: roundedPath(polyline, BEND_RADIUS), link, crosses });
    }

    const keepouts = [
      ...[...byKind.values()].map((n) => ({ center: n.position, half: NODE_FOOTPRINT / 2 })),
      ...gates.map((g) => ({ center: g, half: GATE_FOOTPRINT / 2 })),
    ];
    // The gateway, plus a lane of margin all round: plain highways stay clear of it.
    const guard = gateway && {
      ...gateway,
      from: gateway.from - GRID,
      to: gateway.to + GRID,
      low: gateway.low - GRID,
      high: gateway.high + GRID,
    };
    for (const run of highways ? sharedRuns([...drawn, ...gateLines], keepouts) : []) {
      if (guard && runsOverlap(run, guard)) continue;
      const conduit = new Conduit(run);
      stage.add(conduit);
      this.conduits.push(conduit);
    }
  }

  /**
   * How connected the gateway is (0–1): 1 while the feeder lines that are
   * drawn in are solid, falling as they fade, 0 when none are drawn in yet
   * (or they've gone). A feeder still drawing, or one to a tool nobody has
   * called, doesn't count either way.
   */
  get feedersConnected(): number {
    const connected = this.feeders.filter(({ edge }) => edge.drawn >= 1);
    if (!connected.length) return 0;
    let level = 1;
    for (const { edge, opacity } of connected) level = Math.min(level, edge.material.opacity / opacity);
    return MathUtils.clamp(level, 0, 1);
  }

  /**
   * Feed a tunnel (the secure gateway's conduit): from now on its streams
   * never run ahead of the feeder lines. Data flows inside only while the
   * lines are connected to its ends; when they fade, the streams fade with
   * them, and when they're gone, it stops. Whoever starts the streams after
   * the reveal still decides when they start.
   */
  feed(tunnel: { streams: number }): void {
    this.tunnels.push(tunnel);
    this.capStreams();
  }

  private capStreams(): void {
    if (!this.tunnels.length) return;
    const connected = this.feedersConnected;
    for (const tunnel of this.tunnels) if (tunnel.streams > connected) tunnel.streams = connected;
  }

  /** Whether a floor point is inside a highway or the gateway (packets there ride faster and glow). */
  inHighway(p: Vector3): boolean {
    if (this.gateway && inRun(this.gateway, p)) return true;
    return this.conduits.some((c) => c.level > 0.5 && inRun(c.run, p));
  }

  /** Packets in a highway ride this much faster, glowing the graph's blue. */
  readonly boost: Boost = { at: (p) => this.inHighway(p), speed: 2.2, glow: GRAPH_COLOR };

  /** Draw the lines in, one after another; the plain highways rise as they complete. */
  async reveal(stage: Pick<SceneHost, 'onTick'>): Promise<void> {
    await Promise.all([
      ...this.edges.map(async (edge, i) => {
        await wait(stage, i * STAGGER_SECONDS);
        await tween(stage, DRAW_SECONDS, (t) => (edge.drawn = 1 - (1 - t) ** 3));
      }),
      (async () => {
        await wait(stage, this.edges.length * STAGGER_SECONDS * 0.6);
        await tween(stage, CONDUIT_SECONDS, (t) => this.conduits.forEach((c) => (c.level = t * t * (3 - 2 * t))));
      })(),
    ]);
  }

  /**
   * Draw in the lines among `called` tools that aren't drawn yet (a feeder
   * once its tool is called, a link once both its ends are), one after
   * another. Lines to tools nobody has called stay undrawn.
   */
  async revealAmong(stage: Pick<SceneHost, 'onTick'>, called: ReadonlySet<SystemKind>): Promise<void> {
    const due = this.edges.filter((edge, i) => edge.drawn === 0 && this.edgeKinds[i].every((k) => called.has(k)));
    await Promise.all(
      due.map(async (edge, i) => {
        await wait(stage, i * STAGGER_SECONDS);
        await tween(stage, DRAW_SECONDS, (t) => (edge.drawn = 1 - (1 - t) ** 3));
      }),
    );
  }

  /** Fade the whole web out and reset it. */
  async fade(stage: Pick<SceneHost, 'onTick'>, seconds = 0.8): Promise<void> {
    const start = this.edges.map((edge) => edge.material.opacity);
    await tween(stage, seconds, (t) => {
      this.edges.forEach((edge, i) => (edge.material.opacity = MathUtils.lerp(start[i], 0, t)));
      for (const c of this.conduits) c.level = Math.min(c.level, 1 - t);
      this.capStreams();
    });
    this.hide();
    this.edges.forEach((edge, i) => (edge.material.opacity = start[i]));
  }

  /** Undrawn, invisible. */
  hide(): void {
    for (const edge of this.edges) edge.drawn = 0;
    for (const c of this.conduits) c.level = 0;
    this.capStreams();
  }

  /** Fully drawn at once (specimens). */
  showAll(): void {
    for (const edge of this.edges) edge.drawn = 1;
    for (const c of this.conduits) c.level = 1;
  }

  dispose(): void {
    this.untick();
    for (const edge of this.edges) edge.dispose();
    for (const c of this.conduits) c.dispose();
  }
}

/** Through the tunnel from one end's port to the other's: along the axis, shifting lanes at the middle if need be. */
function tunnelLegs(a: Vector3, b: Vector3, run: SharedRun): LineCurve3[] {
  const mid = (run.from + run.to) / 2;
  const points =
    run.along === 'x'
      ? [a, new Vector3(mid, 0, a.z), new Vector3(mid, 0, b.z), b]
      : [a, new Vector3(a.x, 0, mid), new Vector3(b.x, 0, mid), b];
  const legs: LineCurve3[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i].distanceTo(points[i - 1]) > 1e-6) legs.push(new LineCurve3(points[i - 1].clone(), points[i].clone()));
  }
  return legs;
}
