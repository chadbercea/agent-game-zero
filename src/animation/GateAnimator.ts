import { MathUtils } from 'three';
import { FLOOR_GLOW_OPACITY, SCREEN_GLOW, SCREEN_WIDTH, SKIRT_GLOW } from '../primitives/pad/Pad';
import { type Gate, type GateState, SWEEP_WIDTH } from '../primitives/gate/Gate';
import { statusSignal } from './statusSignal';

const POP_DURATION = 0.45;
const EASE = 4;

/**
 * Drives a Gate's lights from its state:
 * - thinking: a bar sweeps back and forth across the screen, which pulses
 * - open: a gentle pop, then a slow steady breath
 * - denied: a gentle pop, then the same slow pulse as a stopped drone
 * - off: dark
 */
export class GateAnimator {
  private lastState: GateState;
  private time = 0;
  private pop = 0;
  private sweepAmount: number;

  constructor(private readonly gate: Gate) {
    this.lastState = gate.state;
    this.sweepAmount = gate.state === 'thinking' ? 1 : 0;
  }

  update(dt: number): void {
    const { gate } = this;
    const state = gate.state;
    if (state !== this.lastState) {
      if (state === 'open' || state === 'denied') this.pop = POP_DURATION;
      this.lastState = state;
    }
    this.time += dt;
    const t = this.time;
    this.pop = Math.max(0, this.pop - dt);

    // Scanning sweep while thinking.
    const k = 1 - Math.exp(-EASE * dt);
    this.sweepAmount = MathUtils.lerp(this.sweepAmount, state === 'thinking' ? 1 : 0, k);
    gate.sweep.visible = this.sweepAmount > 0.01;
    gate.sweep.position.x = Math.sin(t * 2.6) * (SCREEN_WIDTH / 2 - SWEEP_WIDTH / 2);
    gate.sweepMaterial.opacity = 0.85 * this.sweepAmount;

    // Lights.
    const p = this.pop / POP_DURATION;
    const flash = Math.sin(p * Math.PI);
    let level = 1;
    if (state === 'off') level = 0.35;
    else if (state === 'thinking') level = 0.7 + 0.3 * Math.sin(t * 5);
    else if (state === 'open') level = 0.9 + 0.1 * Math.sin(t * 1.5);
    else if (state === 'denied') level = statusSignal('stopped', t);
    level += flash * 0.6;

    const { screenMaterial, skirtMaterial, glowMaterial } = gate.pad;
    screenMaterial.emissiveIntensity = SCREEN_GLOW * level;
    skirtMaterial.emissiveIntensity = SKIRT_GLOW * (0.6 + 0.4 * level);
    glowMaterial.opacity = FLOOR_GLOW_OPACITY * Math.min(1.3, 0.55 + 0.45 * level);

    // The pop: the pad lifts slightly and settles.
    gate.pad.scale.y = 1 + flash * 0.06;
  }
}
