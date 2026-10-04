import { MathUtils, Matrix4, type Object3D, Vector3 } from 'three';
import type { Packet } from '../primitives/packet/Packet';
import { arcBetween, newArc, ROUTE_LIFT } from './route';

export interface FlightOptions {
  /** World units per second along the route. */
  speed?: number;
  /** Peak height of the arc above the straight line between endpoints. */
  lift?: number;
  /** Seconds the trail lingers after arrival. */
  linger?: number;
}

const TRAIL_SPACING = 0.16;
const TRAIL_OPACITY = 0.55;
const LAUNCH = 0.18;

const scratch = new Matrix4();
const point = new Vector3();

/**
 * Flies a packet from one object to another along a shallow arc, drawing the
 * route as a dotted trail that fades in on launch and out after arrival.
 * Endpoints are re-read every frame so the route tracks bobbing drones.
 */
export class PacketFlight {
  private readonly curve = newArc();
  private readonly speed: number;
  private readonly lift: number;
  private readonly linger: number;
  private elapsed = 0;
  private duration = 1;
  private readonly spin = new Vector3(Math.random(), Math.random(), Math.random()).normalize();
  done = false;

  constructor(
    private readonly packet: Packet,
    private readonly from: Object3D,
    private readonly to: Object3D,
    options: FlightOptions = {},
  ) {
    this.speed = options.speed ?? 3.2;
    this.lift = options.lift ?? ROUTE_LIFT;
    this.linger = options.linger ?? 0.7;
    this.updateCurve();
    this.duration = Math.max(0.5, this.curve.getLength() / this.speed);
  }

  update(dt: number): void {
    if (this.done) return;
    this.elapsed += dt;
    this.updateCurve();

    const { cube, trail, trailMaterial } = this.packet;
    const travel = MathUtils.clamp(this.elapsed / this.duration, 0, 1);
    const arrived = travel >= 1;

    // Packet: eased along the arc, tumbling; pops in on launch, shrinks into the receiver.
    this.curve.getPoint(easeInOut(travel), point);
    cube.position.copy(point);
    cube.rotateOnAxis(this.spin, dt * 4);
    const launch = Math.min(1, this.elapsed / LAUNCH);
    const land = 1 - 0.65 * MathUtils.smoothstep(travel, 0.88, 1);
    cube.scale.setScalar(Math.max(0.001, launch * land));
    cube.visible = !arrived;

    // Trail: dots along the whole route, fading in at launch and out after arrival.
    const length = this.curve.getLength();
    const count = Math.min(trail.instanceMatrix.count, Math.floor(length / TRAIL_SPACING));
    for (let i = 0; i < count; i++) {
      this.curve.getPointAt((i + 0.5) / count, point);
      trail.setMatrixAt(i, scratch.makeTranslation(point.x, point.y, point.z));
    }
    trail.count = count;
    trail.instanceMatrix.needsUpdate = true;
    const after = Math.max(0, this.elapsed - this.duration);
    const fadeOut = 1 - MathUtils.clamp(after / this.linger, 0, 1);
    trailMaterial.opacity = TRAIL_OPACITY * launch * fadeOut;

    if (after >= this.linger) this.done = true;
  }

  private updateCurve(): void {
    arcBetween(this.from, this.to, this.lift, this.curve);
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
