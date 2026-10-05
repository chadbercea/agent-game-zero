import { DroneAnimator } from '../animation/DroneAnimator';
import { Drone, type DroneOptions } from '../primitives/drone/Drone';
import type { SceneHost } from './Stage';

/** Drones and their task pads square up to the isometric camera. */
export const FACE_CAMERA = Math.PI / 4;

export interface SpawnedDrone {
  drone: Drone;
  animator: DroneAnimator;
  despawn: () => void;
}

/** Place an animated drone on the stage at floor position (x, z). */
export function spawnDrone(stage: SceneHost, x: number, z: number, options: DroneOptions = {}): SpawnedDrone {
  const drone = new Drone(options);
  drone.position.set(x, 0, z);
  drone.rotation.y = FACE_CAMERA;
  const animator = new DroneAnimator(drone);
  animator.update(0);
  stage.add(drone);
  const untick = stage.onTick((dt) => animator.update(dt));
  return {
    drone,
    animator,
    despawn: () => {
      untick();
      drone.dispose();
    },
  };
}
