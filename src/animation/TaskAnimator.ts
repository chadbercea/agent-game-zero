import { MathUtils, Matrix4 } from 'three';
import type { Status } from '../core/palette';
import {
  FLOOR_GLOW_OPACITY,
  PAD_TOP,
  SCREEN_GLOW,
  SKIRT_GLOW,
  type Task,
  TETHER_MAX_DOTS,
  WORK_HEIGHT,
} from '../primitives/task/Task';
import { statusSignal } from './statusSignal';

interface WorkProfile {
  spin: number; // cube yaw, rad/s
  bobAmplitude: number;
  bobPeriod: number;
  flow: number; // tether dot travel, units/s (down toward the task)
  tetherOpacity: number;
}

const PROFILES: Record<Status, WorkProfile> = {
  // Spin loop: the cube turns inside its orbiting arrows; attention flows down the tether.
  working: { spin: 1.6, bobAmplitude: 0.03, bobPeriod: 0.9, flow: 0.55, tetherOpacity: 0.9 },
  // Hover low → high: the work item floats, ready, nothing happening yet.
  waiting: { spin: 0.25, bobAmplitude: 0.09, bobPeriod: 3.2, flow: 0.06, tetherOpacity: 0.6 },
  // Halted: the cube stops dead; the tether freezes.
  stopped: { spin: 0, bobAmplitude: 0, bobPeriod: 1, flow: 0, tetherOpacity: 0.85 },
};

const EASE = 2.2;
const REVEAL = 7;
const POP_DURATION = 0.5;
const SHAKE_DURATION = 0.6;
const TETHER_SPACING = 0.09;

const scratch = new Matrix4();

/**
 * Drives a Task's rig from its status: the work item's motion, the per-state
 * adornments (! / marker / orbit), the tether, and the pad's lights.
 */
export class TaskAnimator {
  private readonly current: WorkProfile;
  private readonly reveal = { glyph: 0, marker: 0, orbit: 0 };
  private lastStatus: Status;
  private time: number;
  private flowOffset = 0;
  /** Accumulated bob phase. Integrated per frame so easing the period never jumps it. */
  private bobPhase = 0;
  private pop = 0;
  private shake = 0;
  private readonly phase: number;

  /** Pass the paired DroneAnimator's seed so their lights blink in step. */
  constructor(private readonly task: Task, seed = Math.random()) {
    this.lastStatus = task.status;
    this.current = { ...PROFILES[task.status] };
    this.phase = seed * Math.PI * 2;
    this.time = seed * 10;
    const target = this.revealTarget(task.status);
    Object.assign(this.reveal, target);
  }

  update(dt: number): void {
    const { task } = this;
    const status = task.status;
    if (status !== this.lastStatus) this.enter(status);

    this.time += dt;
    const t = this.time;
    const target = PROFILES[status];
    const k = 1 - Math.exp(-EASE * dt);
    for (const key of Object.keys(target) as (keyof WorkProfile)[]) {
      this.current[key] = MathUtils.lerp(this.current[key], target[key], k);
    }
    const c = this.current;
    const r = 1 - Math.exp(-REVEAL * dt);
    const reveal = this.revealTarget(status);
    for (const key of Object.keys(reveal) as (keyof typeof reveal)[]) {
      this.reveal[key] = MathUtils.lerp(this.reveal[key], reveal[key], r);
    }
    this.pop = Math.max(0, this.pop - dt);
    this.shake = Math.max(0, this.shake - dt);

    const { work, cube, glyph, marker, orbit, tether } = task.rig;

    // Work item: bob, spin, pop on change, shake on halt.
    this.bobPhase = (this.bobPhase + (dt / c.bobPeriod) * Math.PI * 2) % (Math.PI * 2);
    const bob = Math.sin(this.bobPhase + this.phase) * c.bobAmplitude;
    work.position.y = WORK_HEIGHT + bob;
    cube.rotation.y += c.spin * dt;
    if (status === 'stopped') {
      // Settle square to the viewer so the "!" reads.
      cube.rotation.y = MathUtils.lerp(cube.rotation.y, nearestQuarter(cube.rotation.y), k * 2);
    }
    const s = this.shake / SHAKE_DURATION;
    work.position.x = Math.sin(t * 21) * s * s * 0.02;
    const p = this.pop / POP_DURATION;
    cube.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.08);

    // Per-state adornments ease in and out.
    reveal1(glyph, this.reveal.glyph);
    reveal1(marker, this.reveal.marker);
    marker.position.y = 0.3 + Math.sin(t * 2.2 + this.phase) * 0.03;
    marker.rotation.y += dt * 1.2;
    reveal1(orbit, this.reveal.orbit);
    orbit.rotation.y -= dt * 2.6;

    // Tether: evenly spaced dots flowing from the drone down to the work.
    const top = task.tetherTop;
    const span = top - PAD_TOP;
    const count = Math.min(TETHER_MAX_DOTS, Math.floor(span / TETHER_SPACING));
    this.flowOffset = (this.flowOffset + c.flow * dt) % TETHER_SPACING;
    for (let i = 0; i < count; i++) {
      const y = top - ((i * TETHER_SPACING + this.flowOffset) % span);
      tether.setMatrixAt(i, scratch.makeTranslation(0, y, 0));
    }
    tether.count = count;
    tether.instanceMatrix.needsUpdate = true;
    task.rig.tetherMaterial.opacity = c.tetherOpacity;

    // Pad lights follow the shared status rhythm.
    const glow = statusSignal(status, t, this.phase);
    task.rig.screenMaterial.emissiveIntensity = SCREEN_GLOW * glow;
    task.rig.skirtMaterial.emissiveIntensity = SKIRT_GLOW * (0.6 + 0.4 * glow);
    task.rig.glowMaterial.opacity = FLOOR_GLOW_OPACITY * (0.55 + 0.45 * glow);
  }

  private revealTarget(status: Status) {
    return {
      glyph: Number(status === 'stopped'),
      marker: Number(status === 'waiting'),
      orbit: Number(status === 'working'),
    };
  }

  private enter(status: Status): void {
    this.pop = POP_DURATION;
    if (status === 'stopped') this.shake = SHAKE_DURATION;
    this.lastStatus = status;
  }
}

function reveal1(object: { scale: { setScalar(n: number): void }; visible: boolean }, amount: number): void {
  object.visible = amount > 0.01;
  object.scale.setScalar(Math.max(amount, 0.001));
}

function nearestQuarter(angle: number): number {
  const q = Math.PI / 2;
  return Math.round(angle / q) * q;
}
