import { Group, IcosahedronGeometry, MathUtils, Mesh, MeshStandardMaterial } from 'three';
import { NEUTRAL } from '../../core/palette';

/** One puff: where it sits in the cloud (x along the cloud, y up, z depth), how big, and when it pops in (0–1). */
interface PuffSpec {
  x: number;
  y: number;
  z: number;
  r: number;
  at: number;
}

/**
 * The puffs, biggest in the middle, a flat-ish bottom: a cartoon cloud about
 * 2.4 wide. They pop in from the middle outward.
 */
const PUFFS: readonly PuffSpec[] = [
  { x: 0, y: 0.2, z: 0, r: 0.62, at: 0 },
  { x: -0.62, y: 0.02, z: 0.08, r: 0.46, at: 0.18 },
  { x: 0.64, y: 0.04, z: -0.06, r: 0.5, at: 0.22 },
  { x: -0.26, y: 0.46, z: -0.12, r: 0.42, at: 0.34 },
  { x: 0.3, y: 0.5, z: 0.1, r: 0.38, at: 0.4 },
  { x: -1.02, y: -0.08, z: -0.04, r: 0.3, at: 0.5 },
  { x: 1.04, y: -0.06, z: 0.06, r: 0.32, at: 0.56 },
  { x: 0.05, y: -0.12, z: 0.32, r: 0.4, at: 0.3 },
];
/** How long each puff's pop takes, as a share of `materialized`'s 0–1. */
const POP = 0.42;
const BOB = 0.06;
const BOB_SPEED = 1.3;

let geometry: IcosahedronGeometry | undefined;

/**
 * Cloud primitive: a low-poly white cloud, faceted puffs in the house
 * style. Where requests come from (the human in the loop).
 *
 * Rig hooks: `materialized` (0–1) pops the puffs in one after another with
 * a little overshoot, and back out when it falls; `update(dt)` bobs it and
 * makes the puffs breathe.
 */
export class Cloud extends Group {
  readonly material: MeshStandardMaterial;
  private readonly body = new Group();
  private readonly puffs: Mesh[] = [];
  private _materialized = 1;
  private phase = Math.random() * Math.PI * 2;

  constructor() {
    super();
    geometry ??= new IcosahedronGeometry(1, 1);
    this.material = new MeshStandardMaterial({
      color: NEUTRAL.backdrop,
      emissive: NEUTRAL.shell,
      emissiveIntensity: 0.25,
      roughness: 0.85,
      flatShading: true,
    });
    for (const p of PUFFS) {
      const puff = new Mesh(geometry, this.material);
      puff.position.set(p.x, p.y, p.z);
      puff.castShadow = true;
      this.puffs.push(puff);
      this.body.add(puff);
    }
    this.add(this.body);
    this.materialized = 1;
  }

  /** 0 = nothing there, 1 = a whole cloud. Puffs pop in middle-first, each with a little overshoot. */
  get materialized(): number {
    return this._materialized;
  }

  set materialized(value: number) {
    this._materialized = MathUtils.clamp(value, 0, 1);
    PUFFS.forEach((p, i) => {
      const t = MathUtils.clamp((this._materialized - p.at * (1 - POP)) / POP, 0, 1);
      // Overshoot, then settle: a pop.
      const s = t <= 0 ? 0 : 1 + Math.sin(t * Math.PI) * 0.22 * (1 - t);
      this.puffs[i].scale.setScalar(Math.max(0.0001, p.r * s * Math.min(1, t * 1.6)));
      this.puffs[i].visible = t > 0;
    });
  }

  update(dt: number): void {
    this.phase += dt * BOB_SPEED;
    this.body.position.y = Math.sin(this.phase) * BOB;
    // The puffs breathe a little, out of step with each other.
    if (this._materialized >= 1) {
      PUFFS.forEach((p, i) => this.puffs[i].scale.setScalar(p.r * (1 + Math.sin(this.phase * 1.7 + i) * 0.025)));
    }
  }

  dispose(): void {
    this.removeFromParent();
    this.material.dispose();
  }
}
