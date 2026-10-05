import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { Status } from '../core/palette';
import type { Drone } from '../primitives/drone/Drone';
import { DroneAnimator } from './DroneAnimator';

/** Just the rig DroneAnimator writes to; no geometry, materials or DOM. */
function fakeDrone(status: Status) {
  const material = () => ({ emissiveIntensity: 1, opacity: 1 });
  return {
    status,
    fade: 1,
    flash: 0,
    rig: {
      hover: new Object3D(),
      body: new Object3D(),
      arms: [0, 1, 2, 3].map(() => ({ pivot: new Object3D(), rotor: new Object3D() })),
      ringMaterial: material(),
      haloMaterial: material(),
      blurMaterial: material(),
      bladeMaterial: material(),
    },
  } as unknown as Drone;
}

const DT = 1 / 60;

/** Largest frame-to-frame change in hover height while running for `seconds`. */
function maxStep(animator: DroneAnimator, drone: Drone, seconds: number): number {
  let max = 0;
  let last = drone.rig.hover.position.y;
  for (let i = 0; i < seconds / DT; i++) {
    animator.update(DT);
    const y = drone.rig.hover.position.y;
    max = Math.max(max, Math.abs(y - last));
    last = y;
  }
  return max;
}

describe('DroneAnimator', () => {
  // Regression: bob phase was (elapsed / period), so easing the period between
  // states swept the phase by elapsed × Δ(1/period) and the drone shook
  // violently up and down, worse the longer the scene had run.
  it('status transitions never jolt the hover height, even after a long run', () => {
    const drone = fakeDrone('working');
    const animator = new DroneAnimator(drone, 0.5);
    maxStep(animator, drone, 300); // five minutes in

    const transitions: Status[] = ['waiting', 'working', 'stopped', 'waiting', 'stopped', 'working'];
    for (const status of transitions) {
      drone.status = status;
      // Smooth motion (bob + sag/lift easing) stays near 0.013 per frame; the bug produced ~0.28.
      expect(maxStep(animator, drone, 3)).toBeLessThan(0.02);
    }
  });
});
