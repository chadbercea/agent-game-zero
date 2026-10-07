import { type Curve, CurvePath, LineCurve3, Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { seededRandom } from '../core/scatter';
import { inRun } from '../core/sharedRuns';
import { reversed } from '../primitives/branch/gridPath';
import type { Drone } from '../primitives/drone/Drone';
import type { Gateway } from '../primitives/gateway/Gateway';
import type { SystemNode } from '../primitives/node/SystemNode';
import { FACE_CAMERA, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { type CrewMember, fanOut, keepWorking } from './fanOut';
import { returnHome } from './returnHome';
import { revealMap } from './revealMap';
import type { SystemMap } from './SystemMap';
import type { TeamworkGraph } from './TeamworkGraph';
import { fly, tween, wait } from './timeline';
import type { WorkingCrew } from './twoActs';

/** Seconds between handoffs across the graph: much busier than one packet per agent in Act 1. */
export const HANDOFF_INTERVAL = 0.45;
/** Handoffs ride the graph a little slower than progress packets, so they read as work changing hands. */
export const HANDOFF_SPEED = 4;

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
 * Cross between systems through the secure gateway, riding `path` (for a
 * sub-agent: its link's route, feeder → tunnel → feeder, like any sub-agent
 * riding its lines). The moment it enters the tunnel, access is granted:
 * tunnel and lock flash green and the agent acknowledges.
 */
export async function crossGateway(
  stage: SceneHost,
  drone: Drone,
  gateway: Gateway,
  path: Curve<Vector3>,
): Promise<void> {
  let granted = false;
  const watch = stage.onTick(() => {
    if (granted || !inRun(gateway.run, drone.position)) return;
    granted = true;
    gateway.grant();
    drone.flash = 1;
    drone.status = 'working';
  });
  await fly(stage, DroneFlight.along(drone, path));
  watch();
}

/** A straight crossing for a free agent: to the gateway's nearer end, along the tunnel, out to `to`. */
export function gatewayCrossing(from: Vector3, gateway: Gateway, to: Vector3): Curve<Vector3> {
  const here = from.clone().setY(0);
  const [a, b] = gateway.ends;
  const [enter, exit] = here.distanceTo(a) <= here.distanceTo(b) ? [a, b] : [b, a];
  const path = new CurvePath<Vector3>();
  path.add(new LineCurve3(here, enter.clone()));
  path.add(new LineCurve3(enter.clone(), exit.clone()));
  path.add(new LineCurve3(exit.clone(), to.clone().setY(0)));
  return path;
}

/** Where a visiting sub-agent hovers when the node's own sub-agent is there: beside it, to its right on screen. */
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
    const [from, to] = forward ? [link.from, link.to] : [link.to, link.from];
    // What changes hands is the sending system's product.
    void shoot(stage, forward ? link.route : reversed(link.route), HANDOFF_SPEED, graph.boost, from.kind).then(() => {
      const member = at.get(to);
      if (running && member) member.sub.drone.flash = 1;
    });
  });
  return () => {
    running = false;
    untick();
  };
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
