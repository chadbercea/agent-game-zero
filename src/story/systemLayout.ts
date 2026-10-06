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
import { GRID } from '../core/grid';
import { type SharedRun, sharedRuns } from '../core/sharedRuns';

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
  /** Each link within one system: its floor line, node center to node center. */
  lines: Map<TeamworkLink, Vector3[]>;
  /**
   * With a gateway: each node that talks across systems has one feeder line,
   * from its lane port in its side's tunnel end (into the end face, along the
   * tunnel's axis) to the node's center. Cross-system links have no line of
   * their own; their work rides feeder → tunnel → feeder.
   */
  feeders: Map<SystemKind, Vector3[]>;
}

/** The secure gateway's ports: for each tunnel end, the lane points on its end face, and which way is out. */
export interface GatewayPorts {
  /** Per end (from, to): the center point of the end face, the lane ports across it, and the outward direction. */
  ends: { center: Vector3; ports: Vector3[]; out: Vector3 }[];
}

/** The two ends of a gateway run, each with its lane ports (one per grid line across the tunnel). */
export function gatewayPorts(run: SharedRun): GatewayPorts {
  const lanes: number[] = [];
  for (let c = run.low; c <= run.high + 1e-6; c += GRID) lanes.push(c);
  const mid = (run.low + run.high) / 2;
  const at = (along: number, across: number) =>
    run.along === 'x' ? new Vector3(along, 0, across) : new Vector3(across, 0, along);
  const axis = run.along === 'x' ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
  return {
    ends: [
      { center: at(run.from, mid), ports: lanes.map((c) => at(run.from, c)), out: axis.clone().negate() },
      { center: at(run.to, mid), ports: lanes.map((c) => at(run.to, c)), out: axis.clone() },
    ],
  };
}

/**
 * A feeder from a tunnel port out to a node. It leaves the end face along the
 * tunnel's axis for a short stub (FEED_OUT), turns across to the node's line,
 * and comes into the node along the tunnel's axis again. Arriving that way,
 * it never shares the last leg of the node's own gate line (which always
 * arrives across). When the node lies outward of the stub, it's still a
 * shortest grid line from the port.
 */
export function feederLine(port: Vector3, node: Vector3, out: Vector3): Vector3[] {
  const alongX = Math.abs(out.x) > 0;
  const stub = port.clone().addScaledVector(out, FEED_OUT);
  const turn = alongX ? new Vector3(stub.x, 0, node.z) : new Vector3(node.x, 0, stub.z);
  return [port.clone(), stub, turn, node.clone()].filter((p, i, all) => i === 0 || p.distanceTo(all[i - 1]) > 1e-6);
}

/** How far either side of its aim a node's direction may stray (radians): the seed's freedom. */
const AIM_CONE = Math.PI / 3;
/** Rays tried around the aim before giving up on it: aim, then alternately either side, widening. */
const AIM_STEP = Math.PI / 12;
const AIM_STEPS = 6;
/** An aimed node looks this far out along its aim (past the nearest ring) before trying other directions. */
const AIM_REACH = 4.5;
/** No node sits further from its gate than this (past the nearest ring): a map stays a cluster, never a sprawl. */
const MAX_REACH = 4.5;
/** How far a graph link keeps from pads it doesn't connect (nodes and gates). */
const LINK_CLEARANCE = 0.9;
/** A feeder runs at least this far out of the tunnel end (along its axis) before turning toward its node. */
const FEED_OUT = 1;
/** The clear corridor in front of each tunnel end: how far out (in half squares), and how far nodes keep from it. */
const CORRIDOR_STEPS = 6;
const CORRIDOR_CLEARANCE = 1.5;
/** Cross-linked nodes aim this far out past their tunnel end, so their feeders leave the tunnel head-on. */
const FEED_APPROACH = 2.5;
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
  gateway?: SharedRun,
): SystemsLayout {
  // Sometimes a seed boxes a node in with no room close to its gate that meets every rule; then the next seed lays it out.
  for (let attempt = 0; ; attempt++) {
    try {
      return layoutOnce(plans, links, seed + attempt, gateway);
    } catch (e) {
      if (attempt >= 8) throw e;
    }
  }
}

function layoutOnce(
  plans: readonly GateSystemPlan[],
  links: readonly TeamworkLink[],
  seed: number,
  gateway?: SharedRun,
): SystemsLayout {
  const random = seededRandom(seed);
  const placers = plans.map((plan) => new GatePlacer(plan.gate, { avoid: plan.avoid }));
  const gates = placers.map((p) => p.center);
  const home = new Map<SystemKind, number>();
  plans.forEach((plan, g) => plan.kinds.forEach((kind) => home.set(kind, g)));
  const present = links.filter((l) => home.has(l.a) && home.has(l.b));
  const partners = (kind: SystemKind) => present.flatMap((l) => (l.a === kind ? [l.b] : l.b === kind ? [l.a] : []));
  // With a gateway, links between systems don't get lines of their own: they go through the tunnel.
  const crosses = (l: TeamworkLink) => Boolean(gateway) && home.get(l.a) !== home.get(l.b);
  const talksAcross = (kind: SystemKind) => present.some((l) => crosses(l) && (l.a === kind || l.b === kind));
  const ports = gateway ? gatewayPorts(gateway) : undefined;
  // Each system feeds the tunnel end nearer its gate.
  const endOf = gates.map((g) =>
    ports
      ? ports.ends[0].center.distanceTo(g) <= ports.ends[1].center.distanceTo(g)
        ? ports.ends[0]
        : ports.ends[1]
      : undefined,
  );
  const feeders = new Map<SystemKind, Vector3[]>();
  // In front of each tunnel end, a short corridor stays clear of nodes: it's where the feeders come out.
  const corridor = (ports?.ends ?? []).flatMap((end) =>
    Array.from({ length: CORRIDOR_STEPS }, (_, k) => end.center.clone().addScaledVector(end.out, GRID * (k + 1))),
  );

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
    const end = endOf[g];
    const aimAt = partners(kind).flatMap((p) => {
      // Across systems (with a gateway): aim at this side's tunnel approach, where the feeder leaves the tunnel.
      if (end && home.get(p) !== g) return [end.center.clone().addScaledVector(end.out, FEED_APPROACH)];
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
      if (crosses(link)) return [];
      const partner = link.a === kind ? link.b : link.b === kind ? link.a : undefined;
      const at = partner && placed.get(partner);
      return at ? [{ link, at }] : [];
    });
    let chosen: Map<TeamworkLink, Vector3[]> = new Map();
    let feeder: Vector3[] | undefined;

    const extra = (spot: Vector3, route: Vector3[]) => {
      if (corridor.some((c) => c.distanceTo(spot) < CORRIDOR_CLEARANCE)) return false;
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
      // Its feeder (if it talks across systems): out of the tunnel end head-on, then across, clear of other pads.
      let feed: Vector3[] | undefined;
      if (end && talksAcross(kind)) {
        feed = feederLine(end.center, spot, end.out);
        if (!pads.every((p) => distanceToPolyline(p.x, p.z, feed!) >= LINK_CLEARANCE)) return false;
        if ([...feeders.values()].some((f) => distanceToPolyline(spot.x, spot.z, f) < LINK_CLEARANCE)) return false;
        // Feeders never run alongside gate lines.
        const gateRoutes = [...placers.flatMap((p) => p.routes), route];
        if (gateRoutes.some((r) => alongside(feed!, r))) return false;
      }
      if ([...feeders.values()].some((f) => distanceToPolyline(spot.x, spot.z, f) < LINK_CLEARANCE)) return false;
      // Nor does this node's gate line run alongside a feeder already placed.
      if ([...feeders.values()].some((f) => alongside(route, f))) return false;
      const added = [route, ...picks.values(), ...(feed ? [feed] : [])];
      const touched = [spot, placer.center, ...closing.map(({ at }) => at)];
      if (!touched.every((p) => pinwheelFree(p, armsAt(p, added)))) return false;
      chosen = picks;
      feeder = feed;
      return true;
    };

    // Toward the partners first, a little further out if need be; only then anywhere around the gate, still close in.
    const spot =
      (aimed.length ? placer.tryPlace(aimed, extra, AIM_REACH) : null) ??
      placer.tryPlace([...aimed, ...goldenTurns(start).slice(aimed.length ? 1 : 0)], extra, MAX_REACH);
    if (!spot) throw new Error(`layoutSystems: no room for ${kind} (placed: ${[...placed.keys()].join(', ')})`);
    const route = placer.routes[placer.routes.length - 1];
    placed.set(kind, spot);
    gateLine.set(kind, route);
    for (const [link, line] of chosen) lines.set(link, line);
    if (feeder) feeders.set(kind, feeder);
    spots[g][i] = spot;
    routes[g][i] = route;
  }

  // Each tunnel end's feeders take their own lanes: try every way to deal them out, keep the one with the fewest crossings.
  for (const end of ports?.ends ?? []) {
    const fed = [...feeders.entries()].filter(([kind]) => endOf[home.get(kind)!] === end);
    if (fed.length === 0) continue;
    const lanes = end.ports.length >= fed.length ? end.ports : fed.map(() => end.center);
    let best: Vector3[][] | undefined;
    let fewest = Infinity;
    for (const order of permutations(lanes.map((_, i) => i))) {
      const lines = fed.map(([kind], k) => feederLine(lanes[order[k]], placed.get(kind)!, end.out));
      const crossings = countCrossings(lines);
      if (crossings < fewest) [best, fewest] = [lines, crossings];
    }
    fed.forEach(([kind], k) => feeders.set(kind, best![k]));
  }

  return { maps: plans.map((_, g) => ({ spots: spots[g], routes: routes[g] })), lines, feeders };
}

/**
 * Whether two lines run together for a stretch: a shared run (see
 * sharedRuns: two grid squares or more on the same grid line, or a lane
 * apart). Crossing, or passing near, is fine; running alongside is not.
 */
function alongside(a: Vector3[], b: Vector3[]): boolean {
  return sharedRuns([a, b]).length > 0;
}

function* permutations(items: number[]): Generator<number[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) yield [items[i], ...rest];
  }
}

/** How many times axis-aligned polylines cross or touch each other (away from their ends). */
function countCrossings(lines: Vector3[][]): number {
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      for (let s = 1; s < lines[i].length; s++) {
        const [a, b] = [lines[i][s - 1], lines[i][s]];
        const steps = Math.ceil(a.distanceTo(b) / (GRID / 4));
        for (let k = 1; k < steps; k++) {
          const p = a.clone().lerp(b, k / steps);
          if (distanceToPolyline(p.x, p.z, lines[j]) < GRID - 1e-6) {
            count++;
            break;
          }
        }
      }
    }
  }
  return count;
}
