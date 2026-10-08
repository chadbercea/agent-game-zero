import { type Curve, LineCurve3, MathUtils, type Object3D, Vector3 } from 'three';

/** What a flight moves: the drone's floor anchor, and its tilt joint for leaning into travel. */
export interface FlightBody {
  position: Vector3;
  /** Yaw is read so the lean is computed in the drone's own frame. */
  rotation: { y: number };
  rig: { tilt: Object3D };
}

export interface FlightOptions {
  /** World units per second at cruise. */
  speed?: number;
  /** Extra height at mid-flight; hops get a little rise, branch rides stay level. */
  lift?: number;
  /** Start this high above the path and settle onto it (e.g. budding off a parent's body). */
  fromHeight?: number;
  /** Rise this high above the path by the end (e.g. docking back into a parent's body). */
  toHeight?: number;
}

export const FLIGHT_SPEED = 2.4;
/** Hops rise this much at mid-flight, so they read as flight rather than sliding. */
export const HOP_LIFT = 0.35;
const MAX_TILT = 0.22;
/** How quickly the lean follows changes in velocity (per second). */
const TILT_EASE = 6;
const TILT_PER_SPEED = 0.09;

const scratch = new Vector3();
const before = new Vector3();
const velocity = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Moves a drone's floor anchor in a straight line to its target (agents
 * never ride lines or arcs: ILI-969), so it always floats at hover
 * height above where it's heading. The drone keeps facing the camera; it
 * leans into its direction of travel like a real quadcopter instead of
 * turning. DroneAnimator keeps running underneath (bob, rotors, status).
 *
 * Paths are in the drone's parent space at floor level (y = 0).
 */
export class DroneFlight {
  private distance = 0;
  private readonly length: number;
  private readonly speed: number;
  private readonly lift: number;
  private readonly fromHeight: number;
  private readonly toHeight: number;
  done = false;

  private constructor(
    private readonly drone: FlightBody,
    private readonly path: Curve<Vector3>,
    options: FlightOptions,
  ) {
    this.speed = options.speed ?? FLIGHT_SPEED;
    this.lift = options.lift ?? 0;
    this.fromHeight = options.fromHeight ?? 0;
    this.toHeight = options.toHeight ?? 0;
    this.length = Math.max(path.getLength(), 1e-6);
    if (this.length < 1e-3) this.finish();
  }

  /** Hop straight to a floor point, rising a little on the way. */
  static to(drone: FlightBody, target: Vector3, options: FlightOptions = {}): DroneFlight {
    const from = drone.position.clone().setY(0);
    return new DroneFlight(drone, new LineCurve3(from, target.clone().setY(0)), { lift: HOP_LIFT, ...options });
  }

  update(dt: number): void {
    const { tilt } = this.drone.rig;
    if (this.done) {
      // Level out after landing.
      const k = 1 - Math.exp(-TILT_EASE * dt);
      tilt.rotation.x = MathUtils.lerp(tilt.rotation.x, 0, k);
      tilt.rotation.z = MathUtils.lerp(tilt.rotation.z, 0, k);
      return;
    }
    before.copy(this.drone.position);

    // Ease in and out over the whole trip; cruise in the middle.
    this.distance = Math.min(this.length, this.distance + this.speed * dt);
    const u = easeInOut(this.distance / this.length);
    this.path.getPointAt(u, scratch);
    const settle = this.fromHeight * (1 - u) ** 2 + this.toHeight * u ** 2;
    this.drone.position.set(scratch.x, Math.sin(u * Math.PI) * this.lift + settle, scratch.z);

    // Lean into travel, in the drone's own frame (it may be yawed to face the camera).
    if (dt > 0) {
      velocity.subVectors(this.drone.position, before).divideScalar(dt).setY(0);
      const local = velocity.applyAxisAngle(UP, -this.drone.rotation.y);
      const k = 1 - Math.exp(-TILT_EASE * dt);
      tilt.rotation.x = MathUtils.lerp(tilt.rotation.x, clampTilt(local.z * TILT_PER_SPEED), k);
      tilt.rotation.z = MathUtils.lerp(tilt.rotation.z, clampTilt(-local.x * TILT_PER_SPEED), k);
    }

    if (this.distance >= this.length) this.finish();
  }

  private finish(): void {
    const end = this.path.getPointAt(1, scratch);
    this.drone.position.set(end.x, this.toHeight, end.z);
    this.done = true;
  }
}

function clampTilt(v: number): number {
  return MathUtils.clamp(v, -MAX_TILT, MAX_TILT);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
