import { type Curve, CurvePath, LineCurve3, MathUtils, Vector3 } from 'three';
import { seededRandom } from '../core/scatter';
import { reversed } from '../primitives/branch/gridPath';
import type { Deliverable } from '../primitives/deliverable/Deliverable';
import type { SystemNode } from '../primitives/node/SystemNode';
import { Packet } from '../primitives/packet/Packet';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { type CrewMember, fanOut, keepWorking } from './fanOut';
import { returnHome } from './returnHome';
import { revealMap } from './revealMap';
import type { TeamworkGraph } from './TeamworkGraph';
import { tween, wait } from './timeline';
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
 * Act 2, once D3V1N is through the Atlassian gate: the Atlassian system maps
 * out, the Teamwork Graph draws in across every node on the grid, and D3V1N
 * fans out four sub-agents. The Atlassian tools have no job animations, so
 * their sub-agents show signal dots. Resolves with the working crew.
 */
export async function act2(
  stage: SceneHost,
  scene: TwoActScene,
  graph: TeamworkGraph,
  onStep: (step: 'mapping' | 'graph' | 'fan-out') => void = () => {},
): Promise<WorkingCrew> {
  const { drone, act2: system } = scene;
  onStep('mapping');
  await revealMap(stage, system.map);
  onStep('graph');
  await graph.reveal(stage);
  onStep('fan-out');
  drone.status = 'working';
  const crew = await fanOut(stage, drone, system.map);
  const stops = crew.map((member) => keepWorking(stage, member));
  return { crew, stop: () => stops.forEach((stop) => stop()) };
}

/**
 * Handoffs: work products travel node to node along the graph's edges, not
 * via D3V1N. A seeded stream picks an edge and a direction each beat; when a
 * product lands, the sub-agent at that node acknowledges it. Act 1's nodes
 * take part like any other. Returns a function that stops the stream.
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
    void shoot(stage, forward ? link.edge.path : reversed(link.edge.path), HANDOFF_SPEED).then(() => {
      const member = at.get(to);
      if (running && member) member.sub.drone.flash = 1;
    });
  });
  return () => {
    running = false;
    untick();
  };
}

/**
 * The route a work product takes from `node` to D3V1N's gate: across the
 * graph, hop by hop, to the hub (the node the gate reaches first), then down
 * the hub's branch into the gate. A node the graph can't reach goes home its
 * own way: down its branch to its gate, then straight across to D3V1N's.
 */
export function convergeRoute(
  node: SystemNode,
  hub: CrewMember,
  graph: TeamworkGraph,
  own: CrewMember,
  gate: Vector3,
): Curve<Vector3> {
  const path = new CurvePath<Vector3>();
  const hops = graphPath(graph, node, hub.node);
  if (hops) {
    for (const { link, forward } of hops) path.add(forward ? link.route : reversed(link.route));
    path.add(reversed(hub.route));
  } else {
    path.add(reversed(own.route));
    const from = own.route.getPoint(0);
    if (from.distanceTo(gate) > 1e-3) path.add(new LineCurve3(from, gate.clone()));
  }
  return path;
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

/**
 * Converge on a shipped result: every node sends its work product across the
 * graph toward D3V1N. Each one rides the edges to the hub, down into the
 * gate, and rises into the deliverable beside D3V1N, clicking into place.
 * D3V1N adds the last piece, and the pieces fuse into one shipped product.
 */
export async function converge(
  stage: SceneHost,
  scene: TwoActScene,
  graph: TeamworkGraph,
  crew: readonly CrewMember[],
  deliverable: Deliverable,
): Promise<void> {
  const { drone } = scene;
  const gate = scene.act2.gate.position;
  const home = crew.filter((m) => scene.act2.map.nodes.includes(m.node));
  const hub = home.reduce((best, m) => (m.route.getLength() < best.route.getLength() ? m : best), home[0]);
  deliverable.visible = true;
  await Promise.all(
    crew.map(async (member, i) => {
      await wait(stage, i * CONVERGE_STAGGER);
      if (member.job) member.job.product.visible = false;
      await shoot(stage, convergeRoute(member.node, hub, graph, member, gate), CONVERGE_SPEED);
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

/**
 * Everyone comes home: all seven sub-agents dock under D3V1N at the
 * Atlassian gate, empty-handed (their work already flowed home through the
 * graph). Act 2's ride their branches in; Act 1's ride theirs back to the
 * first gate and fly across to D3V1N.
 */
export async function comeHome(
  stage: SceneHost,
  scene: TwoActScene,
  act1Crew: readonly CrewMember[],
  act2Crew: readonly CrewMember[],
): Promise<void> {
  const { drone } = scene;
  const there = scene.act2.gate.position;
  const across = new LineCurve3(there.clone().setY(0), scene.act1.gate.position.clone().setY(0));
  const trips = [
    ...act2Crew.map((member) => ({ member, route: member.route })),
    ...act1Crew.map((member) => {
      const route = new CurvePath<Vector3>();
      route.add(across);
      route.add(member.route);
      return { member, route: route as Curve<Vector3> };
    }),
  ];
  await Promise.all(
    trips.map(async ({ member, route }, i) => {
      await wait(stage, i * 0.25);
      await returnHome(stage, member, drone, route, { carry: false });
    }),
  );
}
