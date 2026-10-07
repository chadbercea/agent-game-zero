import { type Curve, CurvePath, Vector3 } from 'three';
import { BEND_RADIUS, NODE_FOOTPRINT } from '../core/grid';
import { NEUTRAL } from '../core/palette';
import type { SharedRun } from '../core/sharedRuns';
import { Gateway } from '../primitives/gateway/Gateway';
import { gridRoute } from '../core/scatter';
import { Branch } from '../primitives/branch/Branch';
import { reversed, roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { SYSTEM_KINDS, type SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { TEAMWORK_LINKS, type TeamworkLink } from './systemLayout';
import { TeamworkGraph } from './TeamworkGraph';

/**
 * Where everything sits for the reworked story (milestone "Story Rework"),
 * on one isometric grid. D3V1N works from its spot; the request lands just
 * in front of it. Every tool has a place from the start; which ones D3V1N
 * can reach is the access model (see D3V1N_REACH).
 */
export const REWORK = {
  /** Where the cloud sets the ticket down. */
  ticketSpot: new Vector3(0.5, 0, 0.5),
  /** How high the cloud floats over it. */
  cloudHeight: 3.3,
  /** D3V1N's spot: beside the ticket, to its left on screen. */
  d3v1n: new Vector3(-1, 0, 2),
  /** Where D3V1N floats in from, off the grid to the left. */
  d3v1nFrom: new Vector3(-8, 0, 4),
  nodes: {
    jira: new Vector3(3, 0, -0.5),
    github: new Vector3(-3, 0, -1.5),
    notion: new Vector3(-6.5, 0, 0),
    figma: new Vector3(-1, 0, -5),
    confluence: new Vector3(3.5, 0, -5),
    bitbucket: new Vector3(6, 0, -3),
    codesearch: new Vector3(6.5, 0, 0.5),
  } satisfies Record<SystemKind, Vector3>,
  /** Where Rovo flies in from: off the grid, back and to the right, where D3V1N's call goes. */
  rovoFrom: new Vector3(12, 0, -8),
  /**
   * The secure gateway Rovo builds: a glass tunnel over D3V1N's line to Jira,
   * on the straight stretch in front of D3V1N's spot. D3V1N reaches the graph
   * through it.
   */
  gateway: { along: 'x', from: 0, to: 2, low: 2, high: 2 } satisfies SharedRun,
  /** The middle of it all, for framing. */
  center: new Vector3(0.75, 0, -1.5),
} as const;

/**
 * What D3V1N can reach on its own (like Claude Code): Jira, scoped to the one
 * ticket it was handed, and GitHub. Nothing else.
 */
export const D3V1N_REACH: readonly SystemKind[] = ['jira', 'github'];

/** D3V1N's way to one tool it can reach: from under its spot, along the grid, to the node's edge. */
export function reachRoute(kind: SystemKind): Curve<Vector3> {
  const line = gridRoute(REWORK.d3v1n, REWORK.nodes[kind]);
  return roundedPath(trimPolyline(line, 0, NODE_FOOTPRINT / 2), BEND_RADIUS);
}

/** Where the ticket rests while it's in Jira: beside the node, screen-right. */
export const TICKET_IN_JIRA = REWORK.nodes.jira.clone().add(new Vector3(1, 0, -1).normalize().multiplyScalar(1.05));

/** How far a graph line keeps from things it isn't connecting: past a node's edge, with a little air. */
const CLEAR = 0.7;

/**
 * The Teamwork Graph's floor line for each link, along the grid. Each link
 * tries both corners of an L and every Z with a jog on a half-grid line, and
 * takes the shortest that keeps CLEAR of everything else on the grid (other
 * tools, D3V1N's spot, the ticket at Jira); if none can, the clearest.
 */
export function graphLines(links: readonly TeamworkLink[] = TEAMWORK_LINKS): Map<TeamworkLink, Vector3[]> {
  const lines = new Map<TeamworkLink, Vector3[]>();
  for (const link of links) {
    const a = REWORK.nodes[link.a];
    const b = REWORK.nodes[link.b];
    const obstacles = [
      ...SYSTEM_KINDS.filter((k) => k !== link.a && k !== link.b).map((k) => REWORK.nodes[k]),
      REWORK.d3v1n,
      ...(link.a === 'jira' || link.b === 'jira' ? [] : [TICKET_IN_JIRA]),
    ];
    const candidates: Vector3[][] = [
      [a.clone(), new Vector3(b.x, 0, a.z), b.clone()],
      [a.clone(), new Vector3(a.x, 0, b.z), b.clone()],
    ];
    for (let m = -8; m <= 8; m += 0.5) {
      candidates.push([a.clone(), new Vector3(a.x, 0, m), new Vector3(b.x, 0, m), b.clone()]);
      candidates.push([a.clone(), new Vector3(m, 0, a.z), new Vector3(m, 0, b.z), b.clone()]);
    }
    const scored = candidates.map((line) => ({ line, clear: Math.min(...obstacles.map((o) => clearance(line, o))), len: length(line) }));
    const ok = scored.filter((c) => c.clear >= CLEAR).sort((p, q) => p.len - q.len);
    const pick = ok[0] ?? scored.sort((p, q) => q.clear - p.clear)[0];
    lines.set(link, dedupe(pick.line));
  }
  return lines;
}

/** Drop repeated corners (a Z whose jog is on an endpoint's own line is an L). */
function dedupe(line: Vector3[]): Vector3[] {
  return line.filter((p, i) => i === 0 || p.distanceTo(line[i - 1]) > 1e-6);
}

function clearance(line: Vector3[], point: Vector3): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [p, q] = [line[i - 1], line[i]];
    const d = q.clone().sub(p);
    const t = d.lengthSq() > 0 ? Math.min(1, Math.max(0, point.clone().sub(p).dot(d) / d.lengthSq())) : 0;
    best = Math.min(best, p.clone().addScaledVector(d, t).distanceTo(point));
  }
  return best;
}

function length(line: Vector3[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += line[i].distanceTo(line[i - 1]);
  return total;
}

/** The tools on the grid, D3V1N's lines to the ones it can reach, and the graph and gateway Rovo brings. */
export interface ReworkScene {
  nodes: Record<SystemKind, SystemNode>;
  /** D3V1N's access lines, one per tool it can reach. */
  reach: Partial<Record<SystemKind, { line: Branch; route: Curve<Vector3> }>>;
  /** The Teamwork Graph's links between the tools (undrawn until Rovo fires it up). */
  graph: TeamworkGraph;
  /** The secure gateway over D3V1N's line to Jira (unbuilt until Rovo builds it). */
  gateway: Gateway;
}

/** Put every tool on the grid (hidden until a beat shows it) and D3V1N's access lines (undrawn). */
export function reworkScene(stage: SceneHost): ReworkScene {
  const nodes = {} as Record<SystemKind, SystemNode>;
  for (const kind of SYSTEM_KINDS) {
    const node = new SystemNode({ kind });
    node.position.copy(REWORK.nodes[kind]);
    node.visible = false;
    stage.add(node);
    nodes[kind] = node;
  }
  const reach: ReworkScene['reach'] = {};
  for (const kind of D3V1N_REACH) {
    const route = reachRoute(kind);
    const line = new Branch(route, NEUTRAL.packet);
    line.drawn = 0;
    stage.add(line);
    reach[kind] = { line, route };
  }
  const graph = new TeamworkGraph(stage, [SYSTEM_KINDS.map((k) => nodes[k])], { highways: false, lines: graphLines() });
  const gateway = new Gateway(REWORK.gateway);
  stage.add(gateway);
  stage.onTick((dt) => gateway.update(dt));
  return { nodes, reach, graph, gateway };
}

/** The graph's route through these tools in order, each link turned to run the right way. */
export function linkRoute(graph: TeamworkGraph, ...kinds: SystemKind[]): CurvePath<Vector3> {
  const path = new CurvePath<Vector3>();
  for (let i = 1; i < kinds.length; i++) {
    const [a, b] = [kinds[i - 1], kinds[i]];
    const link = graph.links.find((l) => (l.from.kind === a && l.to.kind === b) || (l.from.kind === b && l.to.kind === a));
    if (!link) throw new Error(`linkRoute: no graph link between ${a} and ${b}`);
    path.add(link.from.kind === a ? link.route : reversed(link.route));
  }
  return path;
}
