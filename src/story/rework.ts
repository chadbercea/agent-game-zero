import { type Curve, Vector3 } from 'three';
import { BEND_RADIUS, NODE_FOOTPRINT } from '../core/grid';
import { NEUTRAL } from '../core/palette';
import { gridRoute } from '../core/scatter';
import { Branch } from '../primitives/branch/Branch';
import { roundedPath, trimPolyline } from '../primitives/branch/gridPath';
import { SYSTEM_KINDS, type SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';

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

/** The tools on the grid, and D3V1N's lines to the ones it can reach. */
export interface ReworkScene {
  nodes: Record<SystemKind, SystemNode>;
  /** D3V1N's access lines, one per tool it can reach. */
  reach: Partial<Record<SystemKind, { line: Branch; route: Curve<Vector3> }>>;
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
  return { nodes, reach };
}
