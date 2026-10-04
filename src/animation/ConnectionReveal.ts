import { MathUtils, Matrix4, type Object3D, Vector3 } from 'three';
import type { Connection } from '../primitives/connection/Connection';
import { arcBetween, newArc, ROUTE_LIFT } from './route';

const SPACING = 0.13;
const OPACITY = 0.75;
const DRAW_SPEED = 2.2; // full path lengths per second

const scratch = new Matrix4();
const point = new Vector3();

/**
 * Draws a connection on from its source end when shown, and retracts it
 * toward the source when hidden. Tracks both endpoints every frame.
 */
export class ConnectionReveal {
  private readonly curve = newArc();
  private progress = 0;
  shown = true;

  constructor(
    private readonly connection: Connection,
    private readonly from: Object3D,
    private readonly to: Object3D,
  ) {}

  /** Fully retracted and safe to dispose. */
  get gone(): boolean {
    return !this.shown && this.progress <= 0;
  }

  update(dt: number): void {
    const step = DRAW_SPEED * dt;
    this.progress = MathUtils.clamp(this.progress + (this.shown ? step : -step * 1.5), 0, 1);

    // Same arc as packet flights, so packets ride the revealed path.
    arcBetween(this.from, this.to, ROUTE_LIFT, this.curve);
    const { dots, material } = this.connection;
    const total = Math.min(dots.instanceMatrix.count, Math.floor(this.curve.getLength() / SPACING));
    const drawn = Math.floor(total * easeOut(this.progress));
    for (let i = 0; i < drawn; i++) {
      this.curve.getPointAt((i + 0.5) / total, point);
      dots.setMatrixAt(i, scratch.makeTranslation(point.x, point.y, point.z));
    }
    dots.count = drawn;
    dots.instanceMatrix.needsUpdate = true;
    material.opacity = OPACITY * Math.min(1, this.progress * 3);
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}
