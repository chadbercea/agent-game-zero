import { type Object3D, Vector3 } from 'three';
import { SignalLinkAnimator } from '../animation/SignalLinkAnimator';
import type { Drone } from '../primitives/drone/Drone';
import { Gate } from '../primitives/gate/Gate';
import { SignalLink } from '../primitives/signal/SignalLink';
import { FACE_CAMERA } from './spawnDrone';
import type { SceneHost } from './Stage';

/** Where the link meets the drone: just under its body, in the drone's own units. */
const ATTACH_BELOW_HOVER = 0.42;
/** The drone counts as "over" the base within this floor distance. */
const DOCKED_WITHIN = 0.25;

const base = new Vector3();
const hover = new Vector3();
const scale = new Vector3();

/**
 * Link a drone to the base it works over (a gate, a node) with a signal link
 * that follows the drone's status: a two-way conversation while working, a
 * one-shot into the base on stopping, quiet while waiting. The link only
 * speaks while the drone is actually over the base, so a drone flying in or
 * away stays quiet.
 *
 * Rules:
 * - Over a gate, the two-way conversation only runs while the gate is open
 *   (green): never while it's off or thinking. A red gate gets the stopped
 *   one-shot, never two streams.
 * - Where a job animation is showing at the base, the link stays silent; the
 *   job is the working signal there. Pass `showsJob` for bases that can host one.
 * - Off the base, the link cuts at once. Before moving a drone off its base,
 *   wait for `quiet()` (see leaveBase) so no dots trail behind it.
 *
 * Returns the link (e.g. to keep it in Detail view), `quiet()`, and a function that removes it.
 */
export interface SignalOptions {
  /** True while a job animation is showing at this base; the link is silent then. */
  showsJob?: () => boolean;
}

export interface AttachedSignal {
  link: SignalLink;
  /** No dots on screen right now. */
  quiet: () => boolean;
  detach: () => void;
}

export function attachSignal(
  stage: SceneHost,
  drone: Drone,
  over: Object3D,
  options: SignalOptions = {},
): AttachedSignal {
  const showsJob = options.showsJob ?? (() => false);
  const link = new SignalLink();
  link.rotation.y = FACE_CAMERA;
  const animator = new SignalLinkAnimator(link);
  stage.add(link);
  const untick = stage.onTick((dt) => {
    over.getWorldPosition(base);
    over.getWorldScale(scale);
    const baseScale = scale.y;
    drone.rig.hover.getWorldPosition(hover);
    drone.getWorldScale(scale);
    link.position.copy(base);
    link.scale.setScalar(baseScale);
    link.top = (hover.y - base.y - ATTACH_BELOW_HOVER * scale.y) / baseScale;
    animator.status = drone.status;
    const docked = Math.hypot(hover.x - base.x, hover.z - base.z) < DOCKED_WITHIN && over.visible;
    animator.active = docked && !showsJob();
    animator.conversing = !(over instanceof Gate) || over.state === 'open';
    animator.update(dt);
  });
  return {
    link,
    quiet: () => animator.quiet,
    detach: () => {
      untick();
      link.dispose();
    },
  };
}
