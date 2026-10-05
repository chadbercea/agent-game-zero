import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { NEUTRAL, STATUS_COLOR } from '../../core/palette';
import { PAD_TOP, Pad, SCREEN_DEPTH } from '../pad/Pad';

/**
 * Gate states. Off = gray, nothing happening. Thinking = yellow, checking
 * access. Open = green, works as expected. Denied = red, doesn't.
 */
export type GateState = 'off' | 'thinking' | 'open' | 'denied';

export const GATE_STATES: readonly GateState[] = ['off', 'thinking', 'open', 'denied'];

const GATE_COLOR = {
  off: NEUTRAL.offLight,
  thinking: STATUS_COLOR.waiting,
  open: STATUS_COLOR.working,
  denied: STATUS_COLOR.stopped,
} as const;

export const SWEEP_WIDTH = 0.06;

let sweepGeometry: PlaneGeometry | undefined;

export interface GateOptions {
  state?: GateState;
}

/**
 * Gate primitive: the access point to a system. A fixed object in the world
 * (it belongs to no drone), built on the Pad. While thinking, a bright bar
 * sweeps across its screen so it never reads as an idle drone's yellow.
 * Front faces local +Z.
 */
export class Gate extends Group {
  readonly pad = new Pad();
  /** Scanning bar across the screen (thinking). GateAnimator moves and fades it. */
  readonly sweep: Mesh;
  readonly sweepMaterial: MeshBasicMaterial;
  private _state: GateState;

  constructor(options: GateOptions = {}) {
    super();
    this._state = options.state ?? 'off';
    this.add(this.pad);

    if (!sweepGeometry) {
      sweepGeometry = new PlaneGeometry(SWEEP_WIDTH, SCREEN_DEPTH * 0.9);
      sweepGeometry.rotateX(-Math.PI / 2);
    }
    this.sweepMaterial = new MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0, depthWrite: false });
    this.sweep = new Mesh(sweepGeometry, this.sweepMaterial);
    this.sweep.position.y = PAD_TOP + 0.016;
    this.add(this.sweep);

    this.applyState();
  }

  get state(): GateState {
    return this._state;
  }

  set state(value: GateState) {
    if (value === this._state) return;
    this._state = value;
    this.applyState();
  }

  dispose(): void {
    this.removeFromParent();
    this.pad.dispose();
    this.sweepMaterial.dispose();
  }

  private applyState(): void {
    this.pad.setColor(GATE_COLOR[this._state]);
    // Off is a dim gray screen and edge, with no glow spilling onto the floor.
    this.pad.glowMaterial.visible = this._state !== 'off';
  }
}
