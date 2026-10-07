import { CurvePath, MathUtils, type Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { EMBLEM_SCALE } from '../primitives/node/SystemNode';
import { reversed } from '../primitives/branch/gridPath';
import type { Drone } from '../primitives/drone/Drone';
import { Job } from '../primitives/job/Job';
import type { Ticket } from '../primitives/ticket/Ticket';
import { attachSignal } from '../stage/attachSignal';
import { FACE_CAMERA } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import { JOB_SECONDS } from './fanOut';
import { D3V1N_REACH, type ReworkScene, TICKET_IN_JIRA } from './rework';
import { fly, tween, until, wait } from './timeline';

export type WithinReachStep = 'tools' | 'read' | 'branch' | 'working';

/** How high the ticket floats beside the Jira node while D3V1N reads it: about D3V1N's eye level. */
const READ_HEIGHT = 1.35;
const READ_SECONDS = 2.6;
/** D3V1N rides its lines at a working pace. */
const RIDE_SPEED = 3.2;

/**
 * Beat 2 of the reworked story: D3V1N works within its reach.
 *
 * Its two tools appear with its access lines drawing out to them, Jira and
 * GitHub, while the rest of the tools show only as faint ghosts: there, but
 * out of reach. The ticket it was handed goes into Jira; D3V1N rides its
 * line there and reads it (the one ticket it can see in Jira), then rides
 * its lines over to GitHub and starts a branch, and keeps working. Competent
 * on its own, not stuck. Reads without captions.
 *
 * Resolves once the branch is started; returns a function that stops the
 * work (the GitHub job keeps looping until then).
 */
export async function withinReach(
  stage: SceneHost,
  { drone, ticket, scene }: { drone: Drone; ticket: Ticket; scene: ReworkScene },
  onStep: (step: WithinReachStep) => void = () => {},
): Promise<() => void> {
  const { nodes, reach } = scene;
  const jira = nodes.jira;
  const github = nodes.github;

  // The tools: D3V1N's two come up with its lines drawing out to them; the rest are ghosts.
  onStep('tools');
  for (const node of Object.values(nodes)) {
    node.visible = true;
    node.dim = D3V1N_REACH.includes(node.kind) ? 0 : 1;
  }
  await Promise.all(
    D3V1N_REACH.map(async (kind, i) => {
      await wait(stage, i * 0.35);
      await tween(stage, 1, (t) => (reach[kind]!.line.drawn = 1 - (1 - t) ** 3));
      // The tool at the end of the line pops in.
      await tween(stage, 0.35, (t) => nodes[kind].scale.setScalar(Math.max(0.001, 1 + Math.sin(t * Math.PI) * 0.15)));
    }),
  );
  await wait(stage, 0.3);

  // The ticket goes into Jira: it floats over along an easy arc and settles beside the node.
  onStep('read');
  const from = ticket.position.clone();
  const to = TICKET_IN_JIRA.clone();
  const fromY = ticket.card.position.y;
  const toY = READ_HEIGHT / ticket.scale.y;
  await tween(stage, 1.1, (t) => {
    const e = t * t * (3 - 2 * t);
    ticket.position.lerpVectors(from, to, e).setY(0);
    ticket.card.position.y = MathUtils.lerp(fromY, toY, e) + Math.sin(e * Math.PI) * 0.6;
  });
  jira.light = 'waiting';

  // D3V1N rides its line to Jira and reads the ticket: it's working, the signal running.
  drone.status = 'working';
  await fly(stage, DroneFlight.along(drone, reach.jira!.route, { speed: RIDE_SPEED }));
  jira.light = 'working';
  const reading = attachSignal(stage, drone, jira);
  ticket.glow = 1;
  await wait(stage, READ_SECONDS);
  drone.flash = 1;
  ticket.glow = 0.6;

  // Then over to GitHub, along its own lines, and starts a branch.
  onStep('branch');
  reading.mute(true);
  await until(stage, reading.quiet);
  reading.detach();
  jira.light = 'off';
  const path = new CurvePath<Vector3>();
  path.add(reversed(reach.jira!.route));
  path.add(reach.github!.route);
  await fly(stage, DroneFlight.along(drone, path, { speed: RIDE_SPEED }));
  github.light = 'working';
  const job = new Job('github');
  job.position.copy(github.position);
  job.rotation.y = FACE_CAMERA;
  stage.add(job);
  const untickJob = stage.onTick((dt) => job.update(dt));
  const signal = attachSignal(stage, drone, github, { showsJob: () => job.visible });
  await tween(stage, 0.4, (t) => github.emblem.scale.setScalar(EMBLEM_SCALE * Math.max(0.001, 1 - t)));
  github.emblem.visible = false;
  await tween(stage, JOB_SECONDS.github, (t) => (job.progress = t));
  drone.flash = 1;

  // And keeps working: the branch keeps growing commits, D3V1N green over it.
  onStep('working');
  let t = 0;
  const loop = stage.onTick((dt) => {
    t = (t + dt) % (JOB_SECONDS.github + 1.5);
    job.progress = Math.min(1, t / JOB_SECONDS.github);
  });
  return () => {
    loop();
    untickJob();
    signal.detach();
    job.removeFromParent();
    github.emblem.visible = true;
    github.emblem.scale.setScalar(EMBLEM_SCALE);
    github.light = 'off';
  };
}
