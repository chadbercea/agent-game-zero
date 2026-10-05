import { Curve, Mesh, Vector3 } from 'three';
import { DroneFlight, FLIGHT_SPEED } from '../animation/DroneFlight';
import { type Drone, HOVER_HEIGHT, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { EMBLEM_SCALE } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import type { CrewMember } from './fanOut';
import { fly, tween, wait } from './timeline';

/** A curve traversed end to start, so a sub-agent can ride its branch home. */
class Reversed extends Curve<Vector3> {
  constructor(private readonly curve: Curve<Vector3>) {
    super();
  }

  override getPoint(t: number, target = new Vector3()): Vector3 {
    return this.curve.getPoint(1 - t, target);
  }
}

/** Sub-agents shrink back to this fraction of their size as they dock into the parent. */
const DOCK_SCALE = 0.25;
/** Where the carried work product hangs under the sub-agent, in its (scaled) local units. */
const CARRY_OFFSET = -0.8;

/**
 * Return (story step 6): a sub-agent whose job is done picks up its work
 * product, rides its branch back, rises into the parent while shrinking,
 * delivers the product and despawns. Its node goes dark, the job clears and
 * the system's emblem comes back.
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

  // Ride home along the branch, docking up into the parent's body and shrinking on the last stretch.
  const home = new Reversed(route);
  const seconds = home.getLength() / FLIGHT_SPEED;
  const dockHover = HOVER_HEIGHT * SUB_AGENT_SCALE * DOCK_SCALE;
  await Promise.all([
    fly(stage, DroneFlight.along(sub.drone, home, { toHeight: parent.position.y + HOVER_HEIGHT - dockHover })),
    (async () => {
      await wait(stage, seconds * 0.55);
      await tween(stage, seconds * 0.45, (t) =>
        sub.drone.scale.setScalar(SUB_AGENT_SCALE * (1 - (1 - DOCK_SCALE) * t)),
      );
    })(),
  ]);

  // Delivered.
  sub.drone.rig.hover.remove(carried);
  sub.despawn();
  await restore;
  job.dispose();
}
