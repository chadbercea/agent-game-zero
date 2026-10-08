import { type Curve, CurvePath, LineCurve3, MathUtils, Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { seededRandom } from '../core/scatter';
import { reversed } from '../primitives/branch/gridPath';
import { type Drone, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { Job } from '../primitives/job/Job';
import { hasJob, type SystemKind } from '../primitives/node/emblems';
import { EMBLEM_SCALE, type SystemNode } from '../primitives/node/SystemNode';
import { attachSignal } from '../stage/attachSignal';
import { FACE_CAMERA, type SpawnedDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { type Boost, shoot } from './beam';
import { budOut, graphPathKinds, linkRoute } from './crew';
import { JOB_SECONDS } from './fanOut';
import type { Spawner } from './roster';
import type { TeamworkGraph } from './TeamworkGraph';
import { fly, tween, wait } from './timeline';

export type FullSystemStep = 'scale' | 'full';

/** The tools D3V1N's crew spreads to now (GitHub and Bitbucket already have beat 4's crew). */
export const NEW_GROUND: readonly SystemKind[] = ['notion', 'figma', 'codesearch', 'confluence'];
/** Where Rovo's helpers drop in: its own system's tools. */
export const ROVO_GROUND: readonly SystemKind[] = ['confluence', 'codesearch', 'bitbucket', 'jira'];
const SCREEN_RIGHT = new Vector3(1, 0, -1).normalize();
/** Two of D3V1N's sub-agents on one tool sit this far either side; Rovo's helper sits in front. */
const SIDE = 0.42;
const HELPER_SPOT = new Vector3(1, 0, 1).normalize().multiplyScalar(0.75);
/** Seconds between a sub-agent's products, each one picked from this range. */
const SHIP_EVERY: [number, number] = [1.4, 3.2];
/** How long a Rovo helper stays, and the gap before the next one goes out. */
const HELP_FOR: [number, number] = [4, 8];
const HELP_GAP: [number, number] = [1.2, 3.5];
const MAX_HELPERS = 3;

export interface FullSystemCast {
  drone: Drone;
  rovo: Drone;
  /** Every tool on the grid, by kind. */
  nodes: Record<SystemKind, SystemNode>;
  graph: TeamworkGraph;
  /** D3V1N's way out to a tool: along its own lines, and through the secure gateway for the rest. */
  routeTo: (kind: SystemKind) => Curve<Vector3>;
  /** Rovo's way out to one of its tools (a route that ends where it starts is fine: it just hops beside the tool). */
  rovoRouteTo: (kind: SystemKind) => Curve<Vector3>;
  /** Where packets ride faster and glow (the secure gateway). */
  boost: Boost;
  /** Runs every frame a sub-agent is flying out (e.g. to see it through the gateway). */
  watch?: (drone: Drone) => void;
  /** How sub-agents come into being (the story's roster, so they're in the sequence). */
  spawn?: Spawner;
  /** A product landed in GitHub (the output line turns it into a little block). */
  onCommit: () => void;
  /** Pull the camera back to the whole grid (0–1), if the stage has one to move. */
  pullBack?: (t: number) => void;
}

/**
 * Beat 6 of the reworked story: the whole system, at work.
 *
 * D3V1N's crew grows across the graph until every tool has someone on it:
 * new sub-agents bud off D3V1N, staggered, and head to Notion, Figma, Code
 * search and Confluence (a couple of tools get a second), each going the
 * only way it can, along D3V1N's line through the secure gateway and on
 * along the graph. Each works its tool (its job, or its signal) and keeps
 * sending its product along the graph to GitHub, which feeds the output line:
 * blocks keep flowing into the portal. Once the crew is out, Rovo helps here and there: a few of
 * its own sub-agents drop in on its tools for a while, then go home, and
 * others go elsewhere. Count, placement, timing and paths come from a seeded
 * generator. The camera pulls back to take it all in. No captions: one agent,
 * connected through Rovo and the graph, now runs the whole system.
 *
 * Returns a function that stops everything this beat started.
 */
export async function fullSystem(
  stage: SceneHost,
  cast: FullSystemCast,
  seed = 1,
  onStep: (step: FullSystemStep) => void = () => {},
): Promise<() => void> {
  const { drone, rovo, nodes, routeTo, pullBack } = cast;
  const random = seededRandom(seed);
  const between = ([lo, hi]: [number, number]) => lo + random() * (hi - lo);
  const stops: (() => void)[] = [];
  let running = true;

  onStep('scale');
  if (pullBack) void tween(stage, 3, (t) => pullBack(t * t * (3 - 2 * t)));

  // Where D3V1N's new sub-agents go: one on each new tool, then one or two more doubled up, by the seed.
  const plan: { at: SystemKind; spot: Vector3 }[] = [];
  const doubled = new Set<SystemKind>();
  for (const at of NEW_GROUND) plan.push({ at, spot: nodes[at].position.clone() });
  const extra = 1 + Math.floor(random() * 2);
  for (let i = 0; i < extra; i++) {
    const at = NEW_GROUND[Math.floor(random() * NEW_GROUND.length)];
    if (doubled.has(at)) continue;
    doubled.add(at);
    plan.push({ at, spot: nodes[at].position.clone() });
  }
  for (const p of plan) {
    if (!doubled.has(p.at)) continue;
    // Doubled up: the two sit side by side.
    const first = plan.find((q) => q.at === p.at)!;
    first.spot = nodes[p.at].position.clone().addScaledVector(SCREEN_RIGHT, -SIDE);
    p.spot = nodes[p.at].position.clone().addScaledVector(SCREEN_RIGHT, SIDE);
  }
  // Shuffle the order they go out in.
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }

  // They go out one after another, in that order, a seeded gap apart.
  let start = 0;
  const starts = plan.map((_, i) => (start += i ? between([0.45, 1.1]) : 0));
  const crew = Promise.all(
    plan.map(async ({ at, spot }, i) => {
      await wait(stage, starts[i]);
      if (!running) return;
      const sub = await budOut(stage, drone, `${drone.name}.${4 + i}`, routeTo(at), spot, 4.6, cast.watch, cast.spawn);
      if (!running) return sub.despawn();
      const node = nodes[at];
      node.light = 'working';
      stops.push(work(stage, sub, at, spot, cast, between));
    }),
  );

  // Once D3V1N's crew is all out, Rovo's helpers: a few at a time, dropping in on its tools for a while.
  await crew;
  let helpers = 0;
  const helpersOut = new Set<SpawnedDrone>();
  const helping = (async () => {
    let n = 1;
    while (running) {
      await wait(stage, between(HELP_GAP));
      if (!running || helpers >= MAX_HELPERS) continue;
      const at = ROVO_GROUND[Math.floor(random() * ROVO_GROUND.length)];
      helpers++;
      void help(stage, cast, at, `${rovo.name}.${++n}`, between(HELP_FOR), () => running, helpersOut).finally(
        () => helpers--,
      );
    }
  })();

  onStep('full');
  return () => {
    running = false;
    void helping;
    for (const stop of stops.splice(0)) stop();
    for (const sub of helpersOut) sub.despawn();
    helpersOut.clear();
  };
}

/**
 * One of D3V1N's sub-agents at work on a tool: its job (where the tool has
 * one) or its signal, and every so often its product goes along the graph to
 * GitHub. Returns a function that stops it and sends it away.
 */
function work(
  stage: SceneHost,
  sub: SpawnedDrone,
  at: SystemKind,
  spot: Vector3,
  { nodes, graph, boost, onCommit }: FullSystemCast,
  between: (range: [number, number]) => number,
): () => void {
  const node = nodes[at];
  let job: Job | undefined;
  let signal: ReturnType<typeof attachSignal> | undefined;
  if (hasJob(at)) {
    job = new Job(at);
    job.position.copy(spot);
    job.rotation.y = FACE_CAMERA;
    job.scale.setScalar(0.8);
    stage.add(job);
    node.emblem.visible = false;
  } else {
    signal = attachSignal(stage, sub.drone, node);
  }
  const hops = graphPathKinds(graph, at, 'github');
  const toGithub = hops && hops.length > 1 ? linkRoute(graph, ...hops) : null;
  const seconds = hasJob(at) ? JOB_SECONDS[at] * 0.6 : 0;
  let t = between([0, 0.5]);
  let next = between(SHIP_EVERY);
  const untick = stage.onTick((dt) => {
    if (job && seconds) {
      job.update(dt);
      t = (t + dt / seconds) % 1.25;
      job.progress = MathUtils.clamp(t, 0, 1);
    }
    next -= dt;
    if (next > 0 || !toGithub) return;
    next = between(SHIP_EVERY);
    void shoot(stage, toGithub, 6.5, boost, at).then(onCommit);
  });
  return () => {
    untick();
    signal?.detach();
    job?.removeFromParent();
    node.emblem.visible = true;
    node.emblem.scale.setScalar(EMBLEM_SCALE);
    node.light = 'off';
    sub.despawn();
  };
}

/** A Rovo helper: buds off Rovo, goes to one of its tools, helps for a while, comes back and docks. */
async function help(
  stage: SceneHost,
  { rovo, nodes, rovoRouteTo, watch, spawn }: FullSystemCast,
  at: SystemKind,
  name: string,
  seconds: number,
  running: () => boolean,
  out: Set<SpawnedDrone>,
): Promise<void> {
  const node = nodes[at];
  const spot = node.position.clone().add(HELPER_SPOT);
  const way = rovoRouteTo(at);
  const route: Curve<Vector3> = way.getLength() > 0.05 ? way : new LineCurve3(node.position.clone(), spot.clone());
  const sub = await budOut(stage, rovo, name, route, spot, 4.2, watch, spawn);
  // Stopped while it was on its way out: it never gets to work.
  if (!running()) return sub.despawn();
  out.add(sub);
  const signal = attachSignal(stage, sub.drone, node);
  for (let t = 0; t < seconds && running(); t += 0.25) await wait(stage, 0.25);
  signal.detach();
  if (!running()) return;
  // Home again: back the way it came, and into Rovo.
  const back = new CurvePath<Vector3>();
  const end = route.getPoint(1);
  if (end.distanceTo(spot) > 1e-3) back.add(new LineCurve3(spot.clone(), end));
  back.add(reversed(route));
  await fly(stage, DroneFlight.along(sub.drone, back, { speed: 4.2 }));
  if (!running()) return;
  await tween(stage, 0.4, (t) => {
    sub.drone.scale.setScalar(SUB_AGENT_SCALE * (1 - t * 0.7));
    sub.drone.fade = 1 - t;
  });
  out.delete(sub);
  sub.despawn();
  rovo.flash = 1;
}
