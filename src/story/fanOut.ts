import { DroneFlight } from '../animation/DroneFlight';
import type { Curve, Vector3 } from 'three';
import { reversed } from '../primitives/branch/gridPath';
import type { Drone } from '../primitives/drone/Drone';
import { HOVER_HEIGHT, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { Job } from '../primitives/job/Job';
import type { SystemNode } from '../primitives/node/SystemNode';
import { EMBLEM_SCALE } from '../primitives/node/SystemNode';
import { FACE_CAMERA, type SpawnedDrone, spawnDrone } from '../stage/spawnDrone';
import type { SceneHost } from '../stage/Stage';
import type { SystemMap } from './SystemMap';
import { shoot } from './beam';
import { fly, tween, wait } from './timeline';

/** One sub-agent sent to one system node, and the job it does there. */
export interface CrewMember {
  sub: SpawnedDrone;
  node: SystemNode;
  job: Job;
  /** The sub-agent's branch, gate → node. Packets shoot back along it; the sub-agent rides it home. */
  route: Curve<Vector3>;
  /** Stops the per-frame sync (job motion, node light). Called on return. */
  stop: () => void;
  /** Let this member's branch line fade (it stays drawn while the sub-agent is out). */
  release: () => void;
}

export const FAN_STAGGER = 0.35;
/** Sub-agents bud off the parent at this fraction of their size and grow on the way out. */
const BUD_SCALE = 0.25;
/** Seconds each job takes; different per system so the crew finishes staggered. */
export const JOB_SECONDS = { figma: 5, github: 6, notion: 4.5 } as const;

/**
 * Fan-out (story step 5): the parent spawns one sub-agent per system node.
 * Each buds off the parent's body, grows as it rides its branch out, and
 * floats over its node; the node's emblem tucks away and the node's light
 * starts mirroring its sub-agent's status.
 */
export async function fanOut(stage: SceneHost, parent: Drone, map: SystemMap): Promise<CrewMember[]> {
  // Every branch with a sub-agent heading out stays drawn until that sub-agent is home.
  map.nodes.forEach((_, i) => map.setActive(i, true));
  return Promise.all(
    map.nodes.map(async (node, i) => {
      await wait(stage, i * FAN_STAGGER);
      const sub = spawnDrone(stage, parent.position.x, parent.position.z, {
        name: `${parent.name}.${i + 1}`,
        lineage: parent.lineage,
        subAgent: true,
        status: 'working',
      });
      sub.drone.rotation.y = FACE_CAMERA;
      const job = new Job(node.kind);
      job.position.copy(node.position);
      job.rotation.y = FACE_CAMERA;
      job.visible = false;
      stage.add(job);

      // Once arrived, the node mirrors its sub-agent's status; until then it stays off.
      let arrived = false;
      const stop = stage.onTick((dt) => {
        if (arrived) node.light = sub.drone.status;
        job.update(dt);
      });

      // Bud: start at the parent's hover point, small, and settle down to cruise while growing.
      const budHover = HOVER_HEIGHT * SUB_AGENT_SCALE * BUD_SCALE;
      await Promise.all([
        fly(stage, DroneFlight.along(sub.drone, map.routes[i], { fromHeight: HOVER_HEIGHT - budHover })),
        tween(stage, 0.8, (t) => sub.drone.scale.setScalar(SUB_AGENT_SCALE * (BUD_SCALE + (1 - BUD_SCALE) * t))),
      ]);

      // Arrive: the node lights up, and the emblem tucks away to make room for the work.
      arrived = true;
      job.visible = true;
      await tween(stage, 0.4, (t) => node.emblem.scale.setScalar(EMBLEM_SCALE * Math.max(0.001, 1 - t)));
      node.emblem.visible = false;
      return { sub, node, job, route: map.routes[i], stop, release: () => map.setActive(i, false) };
    }),
  );
}

/** Seconds between progress packets a working sub-agent beams to its parent. */
export const PACKET_INTERVAL = 1.4;

/**
 * Work (story step 5, continued): one crew member does its system's job.
 * The job builds its visual and ends by producing the work product; while
 * working, progress packets shoot back along the branch into the gate.
 */
export async function workOne(stage: SceneHost, member: CrewMember): Promise<void> {
  const { sub, job } = member;
  sub.drone.status = 'working';
  const backToGate = reversed(member.route);
  let sinceShot = PACKET_INTERVAL * 0.5;
  const untick = stage.onTick((dt) => {
    sinceShot += dt;
    if (sinceShot < PACKET_INTERVAL) return;
    sinceShot = 0;
    void shoot(stage, backToGate);
  });
  await tween(stage, JOB_SECONDS[job.kind], (t) => (job.progress = t));
  untick();
  sub.drone.status = 'waiting';
}

/** Every crew member works at once; resolves when the last job is done. */
export async function work(stage: SceneHost, crew: CrewMember[]): Promise<void> {
  await Promise.all(crew.map((member) => workOne(stage, member)));
}

/** Clear a crew without the return trip (story resets). Restores the nodes. */
export function dismiss(crew: CrewMember[]): void {
  for (const { sub, node, job, stop, release } of crew) {
    stop();
    release();
    sub.despawn();
    job.dispose();
    node.emblem.visible = true;
    node.emblem.scale.setScalar(EMBLEM_SCALE);
    node.light = 'off';
  }
}
