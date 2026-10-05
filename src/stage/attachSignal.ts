import { type Object3D, Vector3 } from 'three';
import { SignalLinkAnimator } from '../animation/SignalLinkAnimator';
import type { Drone } from '../primitives/drone/Drone';
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
 * away stays quiet. Returns a function that removes it.
 */
export function attachSignal(stage: SceneHost, drone: Drone, over: Object3D): () => void {
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
    animator.active = Math.hypot(hover.x - base.x, hover.z - base.z) < DOCKED_WITHIN && over.visible;
    animator.update(dt);
  });
  return () => {
    untick();
    link.dispose();
  };
}
