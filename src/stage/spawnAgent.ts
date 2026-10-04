import { Group } from 'three';
import { DroneAnimator } from '../animation/DroneAnimator';
import { TaskAnimator } from '../animation/TaskAnimator';
import { Drone, type DroneOptions } from '../primitives/drone/Drone';
import { Task } from '../primitives/task/Task';
import type { Stage } from './Stage';
import { FACE_CAMERA } from './spawnDrone';

/** Distance from the drone's hover origin down to where the tether meets it. */
const TETHER_ATTACH = 0.42;

export interface SpawnedAgent {
  /** Root of the drone + task pair; position and select by this. */
  unit: Group;
  drone: Drone;
  task: Task;
  despawn: () => void;
}

/**
 * A drone hovering over its task. The drone owns status; the task mirrors it
 * every frame, so status changes only ever go through `drone.status`.
 */
export function spawnAgent(stage: Stage, x: number, z: number, options: DroneOptions = {}): SpawnedAgent {
  const unit = new Group();
  unit.position.set(x, 0, z);
  unit.rotation.y = FACE_CAMERA;

  const drone = new Drone(options);
  const task = new Task({ status: drone.status, subAgent: options.subAgent });
  unit.add(task, drone);

  // Shared seed: lens and screen blink in step.
  const seed = Math.random();
  const droneAnimator = new DroneAnimator(drone, seed);
  const taskAnimator = new TaskAnimator(task, seed);

  const tick = (dt: number) => {
    droneAnimator.update(dt);
    task.status = drone.status;
    task.tetherTop = drone.rig.hover.position.y - TETHER_ATTACH;
    taskAnimator.update(dt);
  };
  tick(0);
  stage.add(unit);
  const untick = stage.onTick(tick);

  return {
    unit,
    drone,
    task,
    despawn: () => {
      untick();
      drone.dispose();
      task.dispose();
      unit.removeFromParent();
    },
  };
}
