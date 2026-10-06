import { type Curve, CurvePath, LineCurve3, MathUtils, Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { seededRandom } from '../core/scatter';
import { reversed } from '../primitives/branch/gridPath';
import type { Deliverable } from '../primitives/deliverable/Deliverable';
import type { Drone } from '../primitives/drone/Drone';
import type { Gateway } from '../primitives/gateway/Gateway';
import type { SystemNode } from '../primitives/node/SystemNode';
import { Packet } from '../primitives/packet/Packet';
import { FACE_CAMERA, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { type CrewMember, fanOut, keepWorking } from './fanOut';
import { returnHome } from './returnHome';
import { revealMap } from './revealMap';
import type { SystemMap } from './SystemMap';
import type { TeamworkGraph } from './TeamworkGraph';
import { fly, tween, wait } from './timeline';
import type { TwoActScene, WorkingCrew } from './twoActs';

/** Seconds between handoffs across the graph: much busier than one packet per agent in Act 1. */
export const HANDOFF_INTERVAL = 0.45;
/** Handoffs ride the graph a little slower than progress packets, so they read as work changing hands. */
export const HANDOFF_SPEED = 4;
/** Work products converging on D3V1N travel at this speed. */
const CONVERGE_SPEED = 4.5;
const CONVERGE_STAGGER = 0.3;
/** Packets ride just above the floor lines; rising into the deliverable takes this long. */
const RIDE_HEIGHT = 0.16;
const RISE_SECONDS = 0.45;

/**
 * Act 2's crew, once its parent (Rovo) is through the Atlassian gate: the
 * Atlassian system maps out and the parent fans out four sub-agents. The
 * Atlassian tools have no job animations, so their sub-agents show signal
 * dots. Resolves with the working crew.
 */
export async function act2(
  stage: SceneHost,
  parent: Drone,
  map: SystemMap,
  onStep: (step: 'mapping' | 'fan-out') => void = () => {},
): Promise<WorkingCrew> {
  onStep('mapping');
  await revealMap(stage, map);
  onStep('fan-out');
  parent.status = 'working';
  const crew = await fanOut(stage, parent, map);
  const stops = crew.map((member) => keepWorking(stage, member));
  return { crew, stop: () => stops.forEach((stop) => stop()), stopEach: stops };
}

/**
 * The security bot sets up the secure gateway: it flies in, the glass tunnel
 * scales up beneath it, and it drops a small lock that settles to float above
 * the tunnel. Then it leaves.
 */
export async function securityGateway(stage: SceneHost, gateway: Gateway, home: Vector3): Promise<void> {
  const bot = spawnDrone(stage, home.x, home.z, {
    name: 'Security',
    lineage: 'violet',
    showLabel: true,
    status: 'working',
  });
  await fly(stage, DroneFlight.to(bot.drone, gateway.center));
  bot.drone.status = 'waiting';
  await tween(stage, 0.9, (t) => (gateway.built = 1 - (1 - t) ** 3));
  bot.drone.rig.hover.getWorldPosition(gateway.dropFrom);
  bot.drone.flash = 1;
  await tween(stage, 0.8, (t) => (gateway.lockDrop = t));
  gateway.grant();
  await wait(stage, 0.5);
  bot.drone.status = 'working';
  await fly(stage, DroneFlight.to(bot.drone, home));
  await tween(stage, 0.6, (t) => (bot.drone.fade = 1 - t));
  bot.despawn();
}

/**
 * Cross between systems through the secure gateway: fly to the gateway's
 * nearer end, pass along the tunnel (access granted: tunnel and lock flash
 * green, the agent acknowledges), and out to `to`.
 */
export async function crossGateway(stage: SceneHost, drone: Drone, gateway: Gateway, to: Vector3): Promise<void> {
  const here = drone.position.clone().setY(0);
  const [a, b] = gateway.ends;
  const [enter, exit] = here.distanceTo(a) <= here.distanceTo(b) ? [a, b] : [b, a];
  const path = new CurvePath<Vector3>();
  path.add(new LineCurve3(here, enter.clone()));
  path.add(new LineCurve3(enter.clone(), exit.clone()));
  path.add(new LineCurve3(exit.clone(), to.clone().setY(0)));
  let granted = false;
  const watch = stage.onTick(() => {
    if (granted || Math.hypot(drone.position.x - enter.x, drone.position.z - enter.z) > 0.3) return;
    granted = true;
    gateway.grant();
    drone.flash = 1;
    drone.status = 'working';
  });
  await fly(stage, DroneFlight.along(drone, path));
  watch();
}

/** Where a visiting sub-agent hovers at another system's node: beside the resident, to its right on screen. */
export function visitSpot(node: SystemNode): Vector3 {
  return node.position.clone().add(new Vector3(Math.cos(FACE_CAMERA), 0, -Math.sin(FACE_CAMERA)).multiplyScalar(0.85));
}

/**
 * Handoffs: work products travel node to node along the graph's edges, not
 * via a parent. A seeded stream picks an edge and a direction each beat; when
 * a product lands, the sub-agent at that node (if any) acknowledges it.
 * Returns a function that stops the stream.
 */
export function graphTraffic(
  stage: SceneHost,
  graph: TeamworkGraph,
  crew: readonly CrewMember[],
  seed = 1,
): () => void {
  if (graph.links.length === 0) return () => {};
  const random = seededRandom(seed);
  const at = new Map<SystemNode, CrewMember>(crew.map((member) => [member.node, member]));
  let since = HANDOFF_INTERVAL;
  let running = true;
  const untick = stage.onTick((dt) => {
    since += dt;
    if (since < HANDOFF_INTERVAL) return;
    since = 0;
    const link = graph.links[Math.floor(random() * graph.links.length)];
    const forward = random() < 0.5;
    const to = forward ? link.to : link.from;
    void shoot(stage, forward ? link.edge.path : reversed(link.edge.path), HANDOFF_SPEED, graph.boost).then(() => {
      const member = at.get(to);
      if (running && member) member.sub.drone.flash = 1;
    });
  });
  return () => {
    running = false;
    untick();
  };
}

/** Breadth-first walk over the graph: the hops from `from` to `to`, or null if they aren't connected. */
export function graphPath(graph: TeamworkGraph, from: SystemNode, to: SystemNode) {
  type Hop = { link: TeamworkGraph['links'][number]; forward: boolean };
  const came = new Map<SystemNode, Hop | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift()!;
    if (node === to) break;
    for (const link of graph.links) {
      const next = link.from === node ? link.to : link.to === node ? link.from : null;
      if (!next || came.has(next)) continue;
      came.set(next, { link, forward: link.from === node });
      queue.push(next);
    }
  }
  if (!came.has(to)) return null;
  const hops: Hop[] = [];
  for (let node = to; node !== from;) {
    const hop = came.get(node)!;
    hops.unshift(hop);
    node = hop.forward ? hop.link.from : hop.link.to;
  }
  return hops;
}

/** One node with its gate line (gate → node), as converge needs it. */
export interface Station {
  node: SystemNode;
  route: Curve<Vector3>;
}

/**
 * The route a work product takes from a node to the target gate: across the
 * graph, hop by hop, to the hub (the target system's node nearest its gate),
 * then down the hub's line into the gate. A node the graph can't reach goes
 * down its own line to its gate, then straight across.
 */
export function convergeRoute(from: Station, hub: Station, graph: TeamworkGraph, gate: Vector3): Curve<Vector3> {
  const path = new CurvePath<Vector3>();
  const hops = graphPath(graph, from.node, hub.node);
  if (hops) {
    for (const { link, forward } of hops) path.add(forward ? link.route : reversed(link.route));
    path.add(reversed(hub.route));
  } else {
    path.add(reversed(from.route));
    const start = from.route.getPoint(0);
    if (start.distanceTo(gate) > 1e-3) path.add(new LineCurve3(start, gate.clone()));
  }
  return path;
}

/**
 * Converge on a shipped result at D3V1N: every node on the grid sends its
 * work product across the graph toward D3V1N's gate. Each one rides the
 * edges to the hub, down into the gate, and rises into the deliverable beside
 * D3V1N, clicking into place. D3V1N adds the last piece, and the pieces fuse
 * into one shipped product. Any job animation's product leaves its node.
 */
export async function converge(
  stage: SceneHost,
  scene: TwoActScene,
  graph: TeamworkGraph,
  crew: readonly CrewMember[],
  deliverable: Deliverable,
): Promise<void> {
  const { drone, act1, act2 } = scene;
  const gate = act1.gate.position;
  const stations = (map: SystemMap): Station[] => map.nodes.map((node, i) => ({ node, route: map.routes[i] }));
  const home = stations(act1.map);
  const hub = home.reduce((best, s) => (s.route.getLength() < best.route.getLength() ? s : best), home[0]);
  const jobs = new Map(crew.flatMap((m) => (m.job ? [[m.node, m.job] as const] : [])));
  deliverable.visible = true;
  await Promise.all(
    [...home, ...stations(act2.map)].map(async (station, i) => {
      await wait(stage, i * CONVERGE_STAGGER);
      const job = jobs.get(station.node);
      if (job) job.product.visible = false;
      await shoot(stage, convergeRoute(station, hub, graph, gate), CONVERGE_SPEED, graph.boost);
      await rise(stage, gate, deliverable);
      deliverable.addPiece();
      drone.flash = 1;
    }),
  );
  // D3V1N's own piece, then the block fuses: shipped.
  await wait(stage, 0.3);
  deliverable.addPiece();
  drone.flash = 1;
  await wait(stage, 0.5);
  await tween(stage, 0.6, (t) => (deliverable.shipped = t * t * (3 - 2 * t)));
}

const riseFrom = new Vector3();
const riseTo = new Vector3();

/** A product lifts off the gate and up into the deliverable. */
async function rise(stage: SceneHost, gate: Vector3, deliverable: Deliverable): Promise<void> {
  const packet = new Packet();
  packet.trail.visible = false;
  packet.cube.scale.setScalar(0.8);
  stage.add(packet);
  riseFrom.set(gate.x, RIDE_HEIGHT, gate.z);
  await tween(stage, RISE_SECONDS, (t) => {
    deliverable.getWorldPosition(riseTo);
    const e = t * t * (3 - 2 * t);
    packet.cube.position.lerpVectors(riseFrom, riseTo, e);
    packet.cube.position.y += Math.sin(e * Math.PI) * 0.3;
    packet.cube.rotation.y = t * 4;
    packet.cube.scale.setScalar(MathUtils.lerp(0.8, 1, t));
  });
  packet.dispose();
}

/** A sub-agent heads home to its parent: dock, hand off (if it carries work), dissolve. */
export async function goHome(
  stage: SceneHost,
  member: CrewMember,
  parent: Drone,
  options: { carry?: boolean } = {},
): Promise<void> {
  await returnHome(stage, member, parent, member.route, options);
}
