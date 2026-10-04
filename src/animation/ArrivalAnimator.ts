import { MathUtils, type Object3D, Vector3 } from 'three';

/** How an agent enters the scene. */
export type Arrival =
  /** Appear immediately (specimens, tests). */
  | { kind: 'instant' }
  /** Top-level agents: drop in from above while the task pad rises. */
  | { kind: 'descend' }
  /** Sub-agents: fly out of the parent drone (`from`, tracked live) to their own spot. */
  | { kind: 'emerge'; from: Object3D };

/** The parts of a drone + task pair that an arrival moves. */
export interface ArrivalTarget {
  /** Drone root; arrivals offset and scale it. Animators below it are untouched. */
  drone: Object3D;
  /** Point on the drone the emerge path is measured to (its hover rig). */
  hover: Object3D;
  task: Object3D;
}

export const EMERGE_DURATION = 1.1;
export const DESCEND_DURATION = 1.3;
const DESCEND_HEIGHT = 5;
const EMERGE_LIFT = 0.7;
/** Emerging drones start this fraction of their final size, as if budding off the parent. */
const EMERGE_START_SCALE = 0.25;

const fromLocal = new Vector3();
const hoverNow = new Vector3();

/**
 * Plays an agent's arrival by offsetting and scaling the drone and task roots
 * only. DroneAnimator and TaskAnimator keep running underneath, so the drone
 * is already hovering in its status motion as it arrives.
 */
export class ArrivalAnimator {
  private elapsed = 0;
  private readonly duration: number;
  private readonly droneScale: number;
  private readonly taskScale: number;
  /** Hover point's offset from the drone origin at rest, in the drone's parent space. */
  private readonly hoverRest = new Vector3();
  done = false;

  constructor(
    private readonly target: ArrivalTarget,
    private readonly arrival: Arrival,
  ) {
    this.droneScale = target.drone.scale.x;
    this.taskScale = target.task.scale.x;
    this.duration = arrival.kind === 'emerge' ? EMERGE_DURATION : arrival.kind === 'descend' ? DESCEND_DURATION : 0;
    target.drone.updateWorldMatrix(true, true);
    target.hover.getWorldPosition(this.hoverRest);
    target.drone.parent?.worldToLocal(this.hoverRest);
    this.hoverRest.sub(target.drone.position);
    this.update(0);
  }

  update(dt: number): void {
    if (this.done) return;
    this.elapsed += dt;
    const t = this.duration > 0 ? MathUtils.clamp(this.elapsed / this.duration, 0, 1) : 1;
    const { drone, task } = this.target;

    if (this.arrival.kind === 'emerge') {
      // Hover point travels from the parent's current hover point to its own rest
      // point. The drone is scaling as it goes, so place its origin to match.
      this.arrival.from.getWorldPosition(fromLocal);
      drone.parent?.worldToLocal(fromLocal);
      const e = easeOutCubic(t);
      const grow = MathUtils.lerp(EMERGE_START_SCALE, 1, e);
      hoverNow.lerpVectors(fromLocal, this.hoverRest, e);
      hoverNow.y += Math.sin(t * Math.PI) * EMERGE_LIFT;
      drone.position.copy(hoverNow).addScaledVector(this.hoverRest, -grow);
      drone.scale.setScalar(this.droneScale * grow);
    } else if (this.arrival.kind === 'descend') {
      drone.position.set(0, DESCEND_HEIGHT * (1 - easeOutCubic(t)), 0);
    }

    // The pad rises out of the floor over the second half, with a little overshoot.
    const pad = this.arrival.kind === 'instant' ? 1 : easeOutBack(MathUtils.clamp((t - 0.35) / 0.65, 0, 1));
    task.scale.set(this.taskScale, this.taskScale * Math.max(pad, 0.001), this.taskScale);
    task.visible = pad > 0.001;

    if (t >= 1) {
      drone.position.set(0, 0, 0);
      drone.scale.setScalar(this.droneScale);
      task.scale.setScalar(this.taskScale);
      task.visible = true;
      this.done = true;
    }
  }
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
