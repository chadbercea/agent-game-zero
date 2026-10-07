import { type Curve, CurvePath, LineCurve3, MathUtils, Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { inRun } from '../core/sharedRuns';
import { reversed } from '../primitives/branch/gridPath';
import type { Drone } from '../primitives/drone/Drone';
import { GRAPH_COLOR } from '../primitives/graph/GraphEdge';
import { Job } from '../primitives/job/Job';
import type { SystemKind } from '../primitives/node/emblems';
import { EMBLEM_SCALE } from '../primitives/node/SystemNode';
import { FACE_CAMERA, type SpawnedDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { shoot } from './beam';
import { JOB_SECONDS } from './fanOut';
import { budOut } from './crew';
import { linkRoute, REWORK, type ReworkScene } from './rework';
import type { TeamworkGraph } from './TeamworkGraph';
import { fly, tween, wait } from './timeline';

export type JuicedCrewStep = 'regroup' | 'spawn' | 'parallel';

/** Juiced, a branch takes half the time it took D3V1N alone in beat 2. */
const BRANCH_SECONDS = JOB_SECONDS.github * 0.5;
/** Seconds between commits each sub-agent sends to GitHub. */
const COMMIT_EVERY = 0.65;
/** Two sub-agents share Bitbucket: side by side over the node, this far either side along screen-right. */
const SIDE = 0.42;
const SCREEN_RIGHT = new Vector3(1, 0, -1).normalize();
const STAGGER = 0.45;

/** One of D3V1N's sub-agents this beat: where it writes code, and how it got there. */
interface Writer {
  sub: SpawnedDrone;
  /** The tool its branch is in. */
  at: SystemKind;
  /** Where it hovers and its branch builds (on the floor). */
  spot: Vector3;
  route: Curve<Vector3>;
}

/**
 * Beat 4 of the reworked story: juiced D3V1N gets three sub-agents writing
 * code in parallel.
 *
 * D3V1N steps back from GitHub to its spot by the gateway and buds three
 * sub-agents. One rides its line to GitHub; two go through the secure
 * gateway, via Jira and along the graph, to Bitbucket and work side by side
 * there. All three build branches at twice beat 2's pace, and their
 * commits keep coming: GitHub's straight into GitHub, Bitbucket's along the
 * graph (through Code search) into GitHub, so the branches feed GitHub.
 * Reads as a lot of work getting done fast. No captions.
 *
 * `stopSolo` stops D3V1N's own branch from beat 2; `onCommit` runs each time
 * a commit lands in GitHub (beat 5 turns them into output). Returns a function that
 * stops the crew and sends it away (for resetting the scene).
 */
export async function juicedCrew(
  stage: SceneHost,
  {
    drone,
    scene,
    stopSolo,
    onCommit = () => {},
  }: { drone: Drone; scene: ReworkScene; stopSolo: () => void; onCommit?: () => void },
  onStep: (step: JuicedCrewStep) => void = () => {},
): Promise<() => void> {
  const { nodes, reach, graph } = scene;
  const github = nodes.github;
  const bitbucket = nodes.bitbucket;

  // D3V1N steps back along its line to its own spot by the gateway, to run the crew from there.
  onStep('regroup');
  stopSolo();
  await fly(stage, DroneFlight.along(drone, reversed(reach.github!.route), { speed: 3.6 }));
  drone.status = 'working';
  drone.flash = 1;

  // Three sub-agents bud off it: two to GitHub, one through the gateway to Bitbucket.
  onStep('spawn');
  const toBitbucket = new CurvePath<Vector3>();
  toBitbucket.add(reach.jira!.route);
  toBitbucket.add(linkRoute(graph, 'jira', 'bitbucket'));
  const plans: Omit<Writer, 'sub'>[] = [
    { at: 'github', spot: github.position.clone(), route: reach.github!.route },
    { at: 'bitbucket', spot: bitbucket.position.clone().addScaledVector(SCREEN_RIGHT, -SIDE), route: toBitbucket },
    { at: 'bitbucket', spot: bitbucket.position.clone().addScaledVector(SCREEN_RIGHT, SIDE), route: toBitbucket },
  ];
  const tuckGithub = tuck(stage, github);
  const tuckBitbucket = tuck(stage, bitbucket);
  const writers = await Promise.all(
    plans.map(async (plan, i): Promise<Writer> => {
      await wait(stage, i * STAGGER);
      const sub = await budOut(stage, drone, `D3V1N.${i + 1}`, plan.route, plan.spot);
      const route = plan.route;
      return { ...plan, sub, route };
    }),
  );
  await Promise.all([tuckGithub, tuckBitbucket]);
  github.light = bitbucket.light = 'working';

  // In parallel: three branches building fast, commits flowing into GitHub.
  onStep('parallel');
  const stops = writers.map((w, i) => write(stage, w, graph, github.position, i, onCommit));
  return () => {
    for (const stop of stops) stop();
    for (const w of writers) w.sub.despawn();
    for (const node of [github, bitbucket]) {
      node.emblem.visible = true;
      node.emblem.scale.setScalar(EMBLEM_SCALE);
      node.light = 'off';
    }
  };
}

/**
 * One sub-agent writing code: its branch builds at the juiced pace and loops,
 * and every so often a commit goes to GitHub (from Bitbucket, along the graph
 * through Code search, as a pull request). Returns a function that stops it.
 */
function write(
  stage: SceneHost,
  w: Writer,
  graph: TeamworkGraph,
  githubAt: Vector3,
  i: number,
  onCommit: () => void,
): () => void {
  const job = new Job('github');
  job.position.copy(w.spot);
  job.rotation.y = FACE_CAMERA;
  job.scale.setScalar(w.at === 'bitbucket' ? 0.8 : 1);
  stage.add(job);
  const feed =
    w.at === 'github'
      ? new LineCurve3(w.spot.clone(), githubAt.clone())
      : linkRoute(graph, 'bitbucket', 'codesearch', 'github');
  const boost = { at: (p: Vector3) => inRun(REWORK.gateway, p), speed: 2, glow: GRAPH_COLOR };
  let t = (i * 0.37) % 1;
  let since = i * 0.3;
  const untick = stage.onTick((dt) => {
    job.update(dt);
    t = (t + dt / BRANCH_SECONDS) % 1.2;
    job.progress = MathUtils.clamp(t, 0, 1);
    since += dt;
    if (since < COMMIT_EVERY) return;
    since = 0;
    void shoot(stage, feed, w.at === 'github' ? 3 : 7, boost, w.at === 'github' ? 'github' : 'bitbucket').then(() => {
      w.sub.drone.flash = Math.max(w.sub.drone.flash, 0.5);
      onCommit();
    });
  });
  return () => {
    untick();
    job.removeFromParent();
  };
}

/** A node's emblem tucks away so branches can build on it. */
async function tuck(stage: SceneHost, node: ReworkScene['nodes'][SystemKind]): Promise<void> {
  await tween(stage, 0.4, (t) => node.emblem.scale.setScalar(EMBLEM_SCALE * Math.max(0.001, 1 - t)));
  node.emblem.visible = false;
}
