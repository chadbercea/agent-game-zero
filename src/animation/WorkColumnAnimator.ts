import { MathUtils, Matrix4 } from 'three';
import { PAD_TOP } from '../primitives/pad/Pad';
import { COLUMN_CUBE_HEIGHT, COLUMN_MAX_DOTS, type WorkColumn } from '../primitives/column/WorkColumn';

const SPACING = 0.09;
const FLOW = 0.55;
const EASE = 4;
const scratch = new Matrix4();

/**
 * Drives a WorkColumn: the cube spins inside counter-rotating orbit arrows and
 * bobs gently, and the dotted line flows down from the drone to the pad. Set
 * `shown` to bring the column in or out; it scales in and out smoothly.
 */
export class WorkColumnAnimator {
  shown = true;
  private amount: number;
  private time = 0;
  private flowOffset = 0;

  constructor(private readonly column: WorkColumn) {
    this.amount = this.shown ? 1 : 0;
  }

  update(dt: number): void {
    const { column } = this;
    this.time += dt;
    this.amount = MathUtils.lerp(this.amount, this.shown ? 1 : 0, 1 - Math.exp(-EASE * dt));
    column.visible = this.amount > 0.01;
    if (!column.visible) return;

    column.work.scale.setScalar(Math.max(0.001, this.amount));
    column.work.position.y = COLUMN_CUBE_HEIGHT + Math.sin(this.time * 2 * Math.PI / 0.9) * 0.03;
    column.cube.rotation.y += dt * 1.6;
    column.orbit.rotation.y -= dt * 2.6;

    // The dotted line flows from the drone's underside down to the pad.
    const top = column.tetherTop;
    const span = Math.max(0, top - PAD_TOP);
    const count = Math.min(COLUMN_MAX_DOTS, Math.floor(span / SPACING));
    this.flowOffset = (this.flowOffset + FLOW * dt) % SPACING;
    for (let i = 0; i < count; i++) {
      const y = top - ((i * SPACING + this.flowOffset) % span);
      column.tether.setMatrixAt(i, scratch.makeTranslation(0, y, 0));
    }
    column.tether.count = count;
    column.tether.instanceMatrix.needsUpdate = true;
    column.tetherMaterial.opacity = 0.9 * this.amount;
  }
}
