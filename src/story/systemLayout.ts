import { Vector3 } from 'three';
import {
  GatePlacer,
  goldenTurns,
  gridRoute,
  inDroneColumn,
  pinwheelFree,
  type RadialMap,
  screenStacked,
  seededRandom,
} from '../core/scatter';
import { distanceToPolyline } from '../primitives/branch/gridPath';
import type { SystemKind } from '../primitives/node/emblems';

/** One relationship the Teamwork Graph tracks between two systems, and why it exists. */
export interface TeamworkLink {
  a: SystemKind;
  b: SystemKind;
  why: string;
  /** A third-party tool joined to the graph through a connector. */
  connector?: boolean;
}

/**
 * What the Teamwork Graph links, and why. Atlassian's own tools are linked
 * natively; third-party tools join through connectors. These are the edges
 * work travels along in Act 2: real relationships, not wiring for its own sake.
 */
export const TEAMWORK_LINKS: readonly TeamworkLink[] = [
  { a: 'jira', b: 'bitbucket', why: 'Issue keys on branches, commits and pull requests' },
  { a: 'jira', b: 'confluence', why: 'Specs and requirements linked to issues' },
  { a: 'bitbucket', b: 'codesearch', why: 'Code search indexes the repositories' },
  { a: 'jira', b: 'github', why: 'GitHub development info on issues', connector: true },
  { a: 'github', b: 'codesearch', why: 'GitHub repositories indexed alongside Bitbucket', connector: true },
  { a: 'jira', b: 'figma', why: 'Designs attached to issues', connector: true },
  { a: 'confluence', b: 'notion', why: 'Docs feed one knowledge layer', connector: true },
];

/** One gate's system: where its gate is, which systems sit behind it, and what its nodes keep clear of. */
export interface GateSystemPlan {
  gate: Vector3;
  kinds: readonly SystemKind[];
  avoid?: readonly Vector3[];
}

export interface SystemsLayout {
  /** Each gate's map, in its plan's kind order. */
  maps: RadialMap[];
  /** Each link's floor line, node center to node center, keyed by the link. */
  lines: Map<TeamworkLink, Vector3[]>;
}

/** How far either side of its aim a node's direction may stray (radians): the seed's freedom. */
const AIM_CONE = Math.PI / 3;
/** Rays tried around the aim before giving up on it: aim, then alternately either side, widening. */
const AIM_STEP = Math.PI / 12;
const AIM_STEPS = 6;
/** An aimed node looks this far out along its aim (past the nearest ring) before trying other directions. */
const AIM_REACH = 4.5;
/** How far a graph link keeps from pads it doesn't connect (nodes and gates). */
const LINK_CLEARANCE = 0.9;
/** How far nodes behind different gates keep from each other, and from each other's lines. */
const NODE_SPACING = 2;
const LINE_CLEARANCE = 1;

/**
 * Lay out every gate's system together, deciding what carries meaning before
 * the seed gets a say:
 * 1. Which gate each system sits behind (the plan).
 * 2. Placement order: most-linked systems first (Jira), so the hubs sit
 *    closest to their gates and everything else gathers around them.
 * 3. Aim: each node faces its partners: already placed ones where they sit,
 *    and for partners behind another gate not placed yet, that gate. A node
 *    with no partners to face gets a free direction.
 * 4. The seed only varies the angle within AIM_CONE around that aim. Then
 *    each node takes the closest spot that fits (GatePlacer: shortest lines,
 *    its own line to the gate, clear of the docked drone's column), looking
 *    further out toward its partners (AIM_REACH) before any other direction.
 * 5. Each graph link it closes is the shortest grid line between the two
 *    nodes (one bend, either way round), clear of every other pad and line
 *    end, and never makes a pinwheel around any node or gate (pinwheelFree).
 */
export function layoutSystems(
  plans: readonly GateSystemPlan[],
  links: readonly TeamworkLink[],
  seed: number,
): SystemsLayout {
  const random = seededRandom(seed);
  const placers = plans.map((plan) => new GatePlacer(plan.gate, { avoid: plan.avoid }));
  const gates = placers.map((p) => p.center);
  const home = new Map<SystemKind, number>();
  plans.forEach((plan, g) => plan.kinds.forEach((kind) => home.set(kind, g)));
  const present = links.filter((l) => home.has(l.a) && home.has(l.b));
  const partners = (kind: SystemKind) => present.flatMap((l) => (l.a === kind ? [l.b] : l.b === kind ? [l.a] : []));

  const order = plans
    .flatMap((plan, g) => plan.kinds.map((kind, i) => ({ kind, g, i })))
    .sort((p, q) => partners(q.kind).length - partners(p.kind).length);

  const placed = new Map<SystemKind, Vector3>();
  const gateLine = new Map<SystemKind, Vector3[]>();
  const lines = new Map<TeamworkLink, Vector3[]>();
  const spots = plans.map((plan) => new Array<Vector3>(plan.kinds.length));
  const routes = plans.map((plan) => new Array<Vector3[]>(plan.kinds.length));

  /** Every line touching a point: gate lines and graph links. */
  const armsAt = (point: Vector3, extra: Vector3[][]) =>
    [...gateLine.values(), ...lines.values(), ...extra].filter(
      (line) => line[0].distanceTo(point) < 1e-6 || line[line.length - 1].distanceTo(point) < 1e-6,
    );

  for (const { kind, g, i } of order) {
    const placer = placers[g];
    const aimAt = partners(kind).flatMap((p) => {
      const at = placed.get(p);
      if (at) return [at];
      return home.get(p) !== g ? [gates[home.get(p)!]] : [];
    });
    // Aimed rays: the aim (nudged by the seed), then alternately either side, widening.
    let aimed: number[] = [];
    let start = random() * Math.PI * 2;
    if (aimAt.length) {
      const mean = aimAt.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(aimAt.length);
      const aim = Math.atan2(mean.z - placer.center.z, mean.x - placer.center.x);
      start = aim + (random() - 0.5) * AIM_CONE;
      aimed = [start];
      for (let k = 1; k <= AIM_STEPS; k++) aimed.push(start + k * AIM_STEP, start - k * AIM_STEP);
    }

    // The links this node closes, to partners already placed: one line each, chosen once the spot is known.
    const closing = present.flatMap((link) => {
      const partner = link.a === kind ? link.b : link.b === kind ? link.a : undefined;
      const at = partner && placed.get(partner);
      return at ? [{ link, at }] : [];
    });
    let chosen: Map<TeamworkLink, Vector3[]> = new Map();

    const extra = (spot: Vector3, route: Vector3[]) => {
      // Clear of the other gates' nodes and lines.
      for (const other of placers) {
        if (other === placer) continue;
        if (other.spots.some((s) => s.distanceTo(spot) < NODE_SPACING)) return false;
        if (other.spots.some((s) => screenStacked(s, spot))) return false;
        if (inDroneColumn(spot.x - other.center.x, spot.z - other.center.z)) return false;
        if (other.routes.some((r) => distanceToPolyline(spot.x, spot.z, r) < LINE_CLEARANCE)) return false;
        if (other.spots.some((s) => distanceToPolyline(s.x, s.z, route) < LINE_CLEARANCE)) return false;
      }
      // Not under a graph link already drawn.
      if ([...lines.values()].some((l) => distanceToPolyline(spot.x, spot.z, l) < LINK_CLEARANCE)) return false;
      // Each link it closes: shortest grid line, either bend, clear of other pads; then no pinwheels anywhere it touches.
      const pads = [...placed.values(), ...gates];
      const picks = new Map<TeamworkLink, Vector3[]>();
      for (const { link, at } of closing) {
        const options = [gridRoute(spot, at), gridRoute(at, spot)];
        const clear = options.find((line) =>
          pads.every((p) => p === at || distanceToPolyline(p.x, p.z, line) >= LINK_CLEARANCE),
        );
        if (!clear) return false;
        picks.set(link, clear);
      }
      const added = [route, ...picks.values()];
      const touched = [spot, placer.center, ...closing.map(({ at }) => at)];
      if (!touched.every((p) => pinwheelFree(p, armsAt(p, added)))) return false;
      chosen = picks;
      return true;
    };

    // Toward the partners first, a little further out if need be; only then anywhere around the gate.
    const spot =
      (aimed.length ? placer.tryPlace(aimed, extra, AIM_REACH) : null) ??
      placer.place([...aimed, ...goldenTurns(start).slice(aimed.length ? 1 : 0)], extra);
    const route = placer.routes[placer.routes.length - 1];
    placed.set(kind, spot);
    gateLine.set(kind, route);
    for (const [link, line] of chosen) lines.set(link, line);
    spots[g][i] = spot;
    routes[g][i] = route;
  }

  return { maps: plans.map((_, g) => ({ spots: spots[g], routes: routes[g] })), lines };
}
