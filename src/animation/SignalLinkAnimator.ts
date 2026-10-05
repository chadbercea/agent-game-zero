import { Color, MathUtils, Matrix4, Vector3 } from 'three';
import { NEUTRAL, STATUS_COLOR, type Status } from '../core/palette';
import { BURST_DOTS, LANE_OFFSET, LINK_MAX_DOTS, type SignalLink } from '../primitives/signal/SignalLink';

const SPACING = 0.1;
/** Stream speed, units per second. */
const FLOW = 0.6;
const EASE = 4;
/** The stopped one-shot: dots leave this far apart in time and fall this fast. */
const BURST_GAP = 0.12;
const BURST_SPEED = 2.2;

const scratch = new Matrix4();
const color = new Color();
const ZERO = new Vector3(0, 0, 0);

/**
 * Drives a SignalLink from its drone's status, so every state tells the same
 * story about the drone ↔ base connection:
 * - working: a conversation. Green rises from the base while gray falls from the drone.
 * - stopped: one shot. Five dots leave the drone, turn red as they sink into
 *   the base, and nothing comes back. Fires once per entry into Stopped.
 * - waiting: quiet.
 *
 * Set `status` (and `active`: the drone is over the base) every frame before `update`.
 */
export class SignalLinkAnimator {
  status: Status = 'waiting';
  active = true;
  private lastStatus: Status | undefined;
  private level = 0;
  private upOffset = 0;
  private downOffset = 0;
  /** Seconds since the current one-shot fired; undefined when none is in flight. */
  private burstTime: number | undefined;

  constructor(private readonly link: SignalLink) {}

  /** True while a stopped one-shot is still falling. */
  get bursting(): boolean {
    return this.burstTime !== undefined;
  }

  update(dt: number): void {
    const { link } = this;
    const status = this.active ? this.status : 'waiting';
    if (status !== this.lastStatus) {
      if (status === 'stopped') this.burstTime = 0;
      this.lastStatus = status;
    }

    const span = Math.max(0, link.top - link.bottom);

    // Working: the two-way conversation fades in and out.
    this.level = MathUtils.lerp(this.level, status === 'working' ? 1 : 0, 1 - Math.exp(-EASE * dt));
    const count = this.level > 0.01 ? Math.min(LINK_MAX_DOTS, Math.floor(span / SPACING)) : 0;
    this.upOffset = (this.upOffset + FLOW * dt) % SPACING;
    this.downOffset = (this.downOffset + FLOW * dt) % SPACING;
    for (let i = 0; i < count; i++) {
      const rise = link.bottom + ((i * SPACING + this.upOffset) % span);
      link.rising.setMatrixAt(i, scratch.makeTranslation(-LANE_OFFSET, rise, 0));
      const fall = link.top - ((i * SPACING + this.downOffset) % span);
      link.falling.setMatrixAt(i, scratch.makeTranslation(LANE_OFFSET, fall, 0));
    }
    link.rising.count = link.falling.count = count;
    link.rising.instanceMatrix.needsUpdate = link.falling.instanceMatrix.needsUpdate = true;
    link.risingMaterial.opacity = link.fallingMaterial.opacity = 0.9 * this.level;

    // Stopped: the one-shot.
    if (this.burstTime === undefined) {
      link.burst.count = 0;
      return;
    }
    this.burstTime += dt;
    let falling = 0;
    for (let k = 0; k < BURST_DOTS; k++) {
      const travelled = (this.burstTime - k * BURST_GAP) * BURST_SPEED;
      const t = span > 0 ? travelled / span : 1;
      // Not launched yet, or already sunk into the base: hidden (scaled to nothing).
      const visible = t >= 0 && t < 1;
      if (visible) falling++;
      scratch.makeTranslation(0, link.top - Math.max(0, travelled), 0);
      if (!visible) scratch.scale(ZERO);
      link.burst.setMatrixAt(k, scratch);
      // Gray as it leaves the drone, red as it reaches the base.
      color.copy(NEUTRAL.packet).lerp(STATUS_COLOR.stopped, MathUtils.smoothstep(t, 0.35, 0.85));
      link.burst.setColorAt(k, color);
    }
    link.burst.count = BURST_DOTS;
    link.burst.instanceMatrix.needsUpdate = true;
    if (link.burst.instanceColor) link.burst.instanceColor.needsUpdate = true;
    // Done once every dot has launched and sunk in. It never repeats on its own.
    if (falling === 0 && this.burstTime > BURST_DOTS * BURST_GAP) {
      this.burstTime = undefined;
      link.burst.count = 0;
    }
  }
}
