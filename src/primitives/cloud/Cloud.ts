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
 * The five cloud shapes (ILI-971). Every shape is puffs, biggest in the
 * middle, listed middle-first with their pop-in times, so they all
 * materialize, bob and breathe the same way; only the silhouette differs.
 *
 * 0. Classic: the cartoon cloud, about 2.4 wide, flat-ish bottom.
 */
const CLASSIC: readonly PuffSpec[] = [
  { x: 0, y: 0.2, z: 0, r: 0.62, at: 0 },
  { x: -0.62, y: 0.02, z: 0.08, r: 0.46, at: 0.18 },
  { x: 0.64, y: 0.04, z: -0.06, r: 0.5, at: 0.22 },
  { x: -0.26, y: 0.46, z: -0.12, r: 0.42, at: 0.34 },
  { x: 0.3, y: 0.5, z: 0.1, r: 0.38, at: 0.4 },
  { x: -1.02, y: -0.08, z: -0.04, r: 0.3, at: 0.5 },
  { x: 1.04, y: -0.06, z: 0.06, r: 0.32, at: 0.56 },
  { x: 0.05, y: -0.12, z: 0.32, r: 0.4, at: 0.3 },
];

/** 1. Long and low: a stretched strip of small puffs, about 3.2 wide. */
const LONG: readonly PuffSpec[] = [
  { x: 0, y: 0.08, z: 0, r: 0.48, at: 0 },
  { x: -0.55, y: 0.02, z: 0.06, r: 0.42, at: 0.14 },
  { x: 0.58, y: 0.04, z: -0.05, r: 0.44, at: 0.18 },
  { x: -1.05, y: -0.04, z: -0.02, r: 0.34, at: 0.32 },
  { x: 1.08, y: -0.02, z: 0.04, r: 0.36, at: 0.36 },
  { x: -1.5, y: -0.1, z: 0.02, r: 0.24, at: 0.5 },
  { x: 1.52, y: -0.08, z: -0.03, r: 0.26, at: 0.56 },
  { x: 0.2, y: 0.32, z: 0.08, r: 0.32, at: 0.26 },
];

/** 2. Tall: a cumulus tower, puffs stacked up from a broad base. */
const TALL: readonly PuffSpec[] = [
  { x: 0, y: 0.25, z: 0, r: 0.6, at: 0 },
  { x: -0.5, y: -0.05, z: 0.08, r: 0.44, at: 0.16 },
  { x: 0.52, y: -0.04, z: -0.06, r: 0.46, at: 0.2 },
  { x: -0.1, y: 0.75, z: -0.06, r: 0.46, at: 0.3 },
  { x: 0.18, y: 1.12, z: 0.06, r: 0.34, at: 0.44 },
  { x: -0.86, y: -0.14, z: -0.04, r: 0.28, at: 0.52 },
  { x: 0.88, y: -0.12, z: 0.05, r: 0.3, at: 0.56 },
  { x: 0.3, y: 0.62, z: 0.2, r: 0.3, at: 0.36 },
];

/** 3. Twin: two lobes, a big one and a smaller one, joined low. */
const TWIN: readonly PuffSpec[] = [
  { x: -0.4, y: 0.18, z: 0, r: 0.56, at: 0 },
  { x: 0.55, y: 0.1, z: -0.04, r: 0.44, at: 0.12 },
  { x: 0.08, y: -0.06, z: 0.12, r: 0.38, at: 0.2 },
  { x: -0.68, y: 0.52, z: -0.08, r: 0.34, at: 0.32 },
  { x: 0.72, y: 0.42, z: 0.06, r: 0.28, at: 0.4 },
  { x: -1.0, y: -0.06, z: 0.04, r: 0.3, at: 0.48 },
  { x: 1.0, y: -0.04, z: -0.02, r: 0.26, at: 0.56 },
  { x: -0.2, y: 0.5, z: 0.16, r: 0.3, at: 0.36 },
];

/** 4. Puff: small and round, about 1.6 across, a tight cluster. */
const PUFF: readonly PuffSpec[] = [
  { x: 0, y: 0.15, z: 0, r: 0.52, at: 0 },
  { x: -0.42, y: 0.02, z: 0.06, r: 0.36, at: 0.16 },
  { x: 0.44, y: 0.04, z: -0.05, r: 0.38, at: 0.2 },
  { x: -0.12, y: 0.48, z: -0.08, r: 0.34, at: 0.3 },
  { x: 0.2, y: 0.46, z: 0.1, r: 0.3, at: 0.36 },
  { x: -0.7, y: -0.08, z: -0.02, r: 0.22, at: 0.5 },
  { x: 0.72, y: -0.06, z: 0.03, r: 0.22, at: 0.56 },
  { x: 0.04, y: -0.1, z: 0.26, r: 0.3, at: 0.26 },
];

/** Every cloud shape; pick one per cloud with `pickCloudShape`. */
export const CLOUD_SHAPES: readonly (readonly PuffSpec[])[] = [CLASSIC, LONG, TALL, TWIN, PUFF];
export const CLOUD_SHAPE_NAMES = ['classic', 'long', 'tall', 'twin', 'puff'] as const;

/** A shape for a new cloud, from a seeded random generator, so a seeded run picks the same shapes every time. */
export function pickCloudShape(random: () => number): number {
  return Math.min(CLOUD_SHAPES.length - 1, Math.floor(random() * CLOUD_SHAPES.length));
}

export interface CloudOptions {
  /** Which of CLOUD_SHAPES (0–4). Default 0, the classic. */
  shape?: number;
}
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

  private _shape = 0;
  private spec: readonly PuffSpec[] = CLASSIC;

  constructor({ shape = 0 }: CloudOptions = {}) {
    super();
    geometry ??= new IcosahedronGeometry(1, 1);
    this.material = new MeshStandardMaterial({
      color: NEUTRAL.backdrop,
      emissive: NEUTRAL.shell,
      emissiveIntensity: 0.25,
      roughness: 0.85,
      flatShading: true,
    });
    this.add(this.body);
    this.shape = shape;
  }

  /** Which of CLOUD_SHAPES it is (0–4). Set it to reshape the cloud; everything else about it stays the same. */
  get shape(): number {
    return this._shape;
  }

  set shape(value: number) {
    this._shape = MathUtils.clamp(Math.floor(value), 0, CLOUD_SHAPES.length - 1);
    this.spec = CLOUD_SHAPES[this._shape];
    for (const puff of this.puffs.splice(0)) puff.removeFromParent();
    for (const p of this.spec) {
      const puff = new Mesh(geometry, this.material);
      puff.position.set(p.x, p.y, p.z);
      puff.castShadow = true;
      this.puffs.push(puff);
      this.body.add(puff);
    }
    this.materialized = this._materialized;
  }

  /** 0 = nothing there, 1 = a whole cloud. Puffs pop in middle-first, each with a little overshoot. */
  get materialized(): number {
    return this._materialized;
  }

  set materialized(value: number) {
    this._materialized = MathUtils.clamp(value, 0, 1);
    this.spec.forEach((p, i) => {
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
      this.spec.forEach((p, i) => this.puffs[i].scale.setScalar(p.r * (1 + Math.sin(this.phase * 1.7 + i) * 0.025)));
    }
  }

  dispose(): void {
    this.removeFromParent();
    this.material.dispose();
  }
}
