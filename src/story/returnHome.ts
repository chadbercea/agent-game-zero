import { type Curve, type Material, Mesh, Vector3 } from 'three';
import { DroneFlight } from '../animation/DroneFlight';
import { type Drone, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { reversed } from '../primitives/branch/gridPath';
import { EMBLEM_SCALE } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import type { CrewMember } from './fanOut';
import { fly, tween } from './timeline';

/** Where the carried work product hangs under the sub-agent, in its (scaled) local units. */
const CARRY_OFFSET = -0.8;
/**
 * How far the sub-agent rises above its normal hover height to dock: its top
 * settles just under the parent's body, at full size (never shrinking).
 */
const DOCK_RISE = 0.25;
const HANDOFF_SECONDS = 0.5;
const DISSOLVE_SECONDS = 0.8;
const DISSOLVE_DRIFT = 0.25;

const handoffFrom = new Vector3();
const handoffTo = new Vector3();

/**
 * Return (story step 6): a sub-agent whose job is done picks up its work
 * product and rides its branch back to the gate, docking just under the
 * parent at full size. It hands the product up into the parent (which flashes
 * and lifts slightly to acknowledge it), then dissolves in place, drifting
 * up, and despawns. Its node goes dark, the job clears, the emblem comes back,
 * and its branch line is released to fade.
 */
export async function returnHome(stage: SceneHost, member: CrewMember, parent: Drone, route: Curve<Vector3>): Promise<void> {
  const { sub, node, job, stop } = member;

  // Pick up the work product: it now travels under the sub-agent.
  const carried = new Mesh(job.product.geometry, job.product.material);
  carried.castShadow = true;
  carried.position.y = CARRY_OFFSET;
  carried.scale.setScalar(1 / SUB_AGENT_SCALE);
  job.product.visible = false;
  sub.drone.rig.hover.add(carried);
  stop();
  sub.drone.status = 'working';
  node.light = 'off';

  // The node clears behind it: the job sinks away and the emblem returns.
  const restore = (async () => {
    await tween(stage, 0.5, (t) => job.scale.setScalar(Math.max(0.001, 1 - t)));
    job.visible = false;
    node.emblem.visible = true;
    await tween(stage, 0.5, (t) => node.emblem.scale.setScalar(EMBLEM_SCALE * Math.max(0.001, t)));
  })();

  // Ride home along the branch and dock just under the parent, at full size.
  await fly(stage, DroneFlight.along(sub.drone, reversed(route), { toHeight: DOCK_RISE }));
  sub.drone.status = 'waiting';

  // Hand off: the product lifts out of the sub-agent and up into the parent's body.
  carried.getWorldPosition(handoffFrom);
  sub.drone.rig.hover.remove(carried);
  carried.position.copy(handoffFrom);
  carried.scale.setScalar(1);
  stage.add(carried);
  const material = job.product.material as Material;
  material.transparent = true;
  await tween(stage, HANDOFF_SECONDS, (t) => {
    parent.rig.hover.getWorldPosition(handoffTo);
    const e = t * t * (3 - 2 * t);
    carried.position.lerpVectors(handoffFrom, handoffTo, e);
    carried.rotation.y = t * 4;
    material.opacity = 1 - Math.max(0, (t - 0.6) / 0.4);
  });
  carried.removeFromParent();
  parent.flash = 1;

  // Dissolve in place: fade out at full size, drifting gently up.
  await tween(stage, DISSOLVE_SECONDS, (t) => {
    sub.drone.fade = 1 - t;
    sub.drone.position.y = DOCK_RISE + DISSOLVE_DRIFT * t;
  });

  // Gone. Its branch line is free to fade now.
  member.release();
  sub.despawn();
  await restore;
  job.dispose();
}
