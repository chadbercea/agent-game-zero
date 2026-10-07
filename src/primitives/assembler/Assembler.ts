import { Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { solid } from '../../core/mesh';
import { NEUTRAL, STATUS_COLOR } from '../../core/palette';

/** A little block: one piece of output, about the size of a work product. */
export const LITTLE_BLOCK = 0.17;
const GAP = 0.04;
/** The bigger block a full set fuses into. */
export const BIG_BLOCK = LITTLE_BLOCK * 2 + GAP;
/** How long a little block takes to click into its slot, and a full set to fuse. */
const CLICK_SECONDS = 0.3;
const FUSE_SECONDS = 0.55;
/** How high the block sits over the assembler's base plate. */
const BLOCK_Y = 0.12 + BIG_BLOCK / 2;

/** The eight slots of a 2 × 2 × 2 block, bottom layer first. */
const SLOTS = [
  [-1, -1, -1],
  [1, -1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [-1, 1, -1],
  [1, 1, -1],
  [-1, 1, 1],
  [1, 1, 1],
].map(([x, y, z]) => new Vector3(x, y, z).multiplyScalar((LITTLE_BLOCK + GAP) / 2));

let little: RoundedBoxGeometry | undefined;
let big: RoundedBoxGeometry | undefined;

/**
 * Assembler primitive: where little blocks build a bigger block. A low base
 * plate with a 2 × 2 × 2 block taking shape on it: little blocks click into
 * place one at a time (`add`), and when all eight are in they close the
 * gaps and fuse into one bigger block, which flashes green (it's done). Take
 * it away (`take`) and the plate is ready for the next eight.
 *
 * Neutral gray like every work product. `update(dt)` runs the clicks and
 * the fuse.
 */
export class Assembler extends Group {
  readonly material: MeshStandardMaterial;
  private readonly plate: Mesh;
  private readonly pieces: Mesh[];
  private readonly block: Mesh;
  private filled = 0;
  private readonly pop: number[] = [];
  /** 0 = pieces apart, 1 = fused. */
  private fuse = 0;
  private fusing = false;
  private glow = 0;

  constructor() {
    super();
    little ??= new RoundedBoxGeometry(LITTLE_BLOCK, LITTLE_BLOCK, LITTLE_BLOCK, 2, 0.03);
    big ??= new RoundedBoxGeometry(BIG_BLOCK, BIG_BLOCK, BIG_BLOCK, 3, 0.05);
    this.material = new MeshStandardMaterial({ color: NEUTRAL.packet, roughness: 0.4, flatShading: true });
    this.material.emissive.copy(STATUS_COLOR.working);
    this.material.emissiveIntensity = 0;
    const plateMaterial = new MeshStandardMaterial({ color: NEUTRAL.shell, roughness: 0.5 });
    this.plate = solid(new RoundedBoxGeometry(0.62, 0.1, 0.62, 2, 0.03), plateMaterial);
    this.plate.position.y = 0.05;
    this.add(this.plate);
    this.pieces = SLOTS.map((slot) => {
      const piece = solid(little!, this.material);
      piece.position.copy(slot).setY(slot.y + BLOCK_Y);
      piece.visible = false;
      this.add(piece);
      this.pop.push(1);
      return piece;
    });
    this.block = solid(big, this.material);
    this.block.position.y = BLOCK_Y;
    this.block.visible = false;
    this.add(this.block);
  }

  /** How many little blocks are in (0–8). */
  get count(): number {
    return this.filled;
  }

  /** A whole bigger block, fused and waiting to be taken. */
  get ready(): boolean {
    return this.fuse >= 1;
  }

  /** Where the next little block clicks in, in world space (for flying one in). */
  nextSlot(target = new Vector3()): Vector3 {
    return this.pieces[Math.min(this.filled, SLOTS.length - 1)].getWorldPosition(target);
  }

  /** Click the next little block in. When the eighth is in, the set fuses. Returns false if full. */
  addBlock(): boolean {
    if (this.filled >= SLOTS.length || this.fusing) return false;
    this.pieces[this.filled].visible = true;
    this.pop[this.filled] = 0;
    this.filled++;
    if (this.filled === SLOTS.length) this.fusing = true;
    return true;
  }

  /** Take the bigger block away (it leaves as its own mesh, at the same spot) and clear the plate. */
  take(): Mesh | null {
    if (!this.ready) return null;
    const out = new Mesh(big!, this.material.clone());
    out.castShadow = true;
    (out.material as MeshStandardMaterial).emissiveIntensity = 0;
    this.block.getWorldPosition(out.position);
    this.block.visible = false;
    this.filled = 0;
    this.fuse = 0;
    this.fusing = false;
    this.pieces.forEach((p, i) => {
      p.visible = false;
      p.position.copy(SLOTS[i]).setY(SLOTS[i].y + BLOCK_Y);
    });
    return out;
  }

  update(dt: number): void {
    this.pieces.forEach((piece, i) => {
      if (this.pop[i] >= 1) return;
      this.pop[i] = Math.min(1, this.pop[i] + dt / CLICK_SECONDS);
      const p = this.pop[i];
      // Overshoot, then settle: a click into place.
      piece.scale.setScalar(Math.max(0.001, Math.sin(p * Math.PI * 0.75) / Math.sin(Math.PI * 0.75)));
    });
    // Once the last click lands, the eight close up and become one.
    if (this.fusing && this.fuse < 1 && this.pop[SLOTS.length - 1] >= 1) {
      this.fuse = Math.min(1, this.fuse + dt / FUSE_SECONDS);
      const e = this.fuse * this.fuse * (3 - 2 * this.fuse);
      this.pieces.forEach((piece, i) => piece.position.copy(SLOTS[i]).multiplyScalar(1 - (GAP / (LITTLE_BLOCK + GAP)) * e).setY(SLOTS[i].y * (1 - (GAP / (LITTLE_BLOCK + GAP)) * e) + BLOCK_Y));
      if (this.fuse >= 1) {
        this.pieces.forEach((p) => (p.visible = false));
        this.block.visible = true;
        this.glow = 1;
      }
    }
    this.glow = Math.max(0, this.glow - dt * 1.2);
    this.material.emissiveIntensity = this.glow;
  }

  dispose(): void {
    this.removeFromParent();
    this.material.dispose();
    (this.plate.material as MeshStandardMaterial).dispose();
  }
}
