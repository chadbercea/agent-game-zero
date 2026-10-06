import { Group, MathUtils, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { NEUTRAL, STATUS_COLOR } from '../../core/palette';

/** One piece: the size of a work product. */
export const PIECE_SIZE = 0.2;
const GAP = 0.05;
/** Pieces seconds to pop into place. */
const POP_SECONDS = 0.35;
/** Seconds the shipped glow takes to settle back to neutral. */
const GLOW_DECAY = 0.9;

/** The eight slots of a 2 × 2 × 2 block, filled bottom layer first. */
const SLOTS = [
  [-1, -1, -1],
  [1, -1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [-1, 1, -1],
  [1, 1, -1],
  [-1, 1, 1],
  [1, 1, 1],
].map(([x, y, z]) => new Vector3(x, y, z).multiplyScalar((PIECE_SIZE + GAP) / 2));

let pieceGeometry: RoundedBoxGeometry | undefined;
let blockGeometry: RoundedBoxGeometry | undefined;

/**
 * Deliverable primitive: the one shipped result the whole system converges
 * on. Work products arrive one at a time and click into a 2 × 2 × 2 block
 * (`addPiece`); `ship` closes the gaps and fuses them into one larger product,
 * which flashes green and settles. Neutral gray like every work product.
 */
export class Deliverable extends Group {
  static readonly CAPACITY = SLOTS.length;
  readonly material: MeshStandardMaterial;
  private readonly pieces: Mesh[];
  private readonly block: Mesh;
  private readonly popped: number[] = [];
  private filled = 0;
  private glow = 0;
  /** 0 = pieces apart, 1 = fused into the block. */
  private fuse = 0;

  constructor() {
    super();
    this.material = new MeshStandardMaterial({ color: NEUTRAL.packet, roughness: 0.4, flatShading: true });
    this.material.emissive.copy(STATUS_COLOR.working);
    this.material.emissiveIntensity = 0;
    pieceGeometry ??= new RoundedBoxGeometry(PIECE_SIZE, PIECE_SIZE, PIECE_SIZE, 2, 0.035);
    blockGeometry ??= new RoundedBoxGeometry(PIECE_SIZE * 2, PIECE_SIZE * 2, PIECE_SIZE * 2, 3, 0.06);
    this.pieces = SLOTS.map((slot) => {
      const piece = new Mesh(pieceGeometry, this.material);
      piece.castShadow = true;
      piece.position.copy(slot);
      piece.visible = false;
      super.add(piece);
      this.popped.push(0);
      return piece;
    });
    this.block = new Mesh(blockGeometry, this.material);
    this.block.castShadow = true;
    this.block.visible = false;
    super.add(this.block);
  }

  /** How many pieces are in. */
  get count(): number {
    return this.filled;
  }

  /** Click the next work product into place. Returns false when the block is full. */
  addPiece(): boolean {
    if (this.filled >= SLOTS.length) return false;
    this.pieces[this.filled].visible = true;
    this.filled++;
    return true;
  }

  /** Fuse the pieces into one product (0–1); at 1 it flashes green, shipped. */
  set shipped(t: number) {
    const before = this.fuse;
    this.fuse = MathUtils.clamp(t, 0, 1);
    this.pieces.forEach((piece, i) => piece.position.copy(SLOTS[i]).multiplyScalar(1 - (GAP / (PIECE_SIZE + GAP)) * this.fuse));
    const fused = this.fuse >= 1;
    this.block.visible = fused;
    this.pieces.forEach((piece, i) => (piece.visible = !fused && i < this.filled));
    if (fused && before < 1) this.glow = 1;
  }

  /** Back to empty. */
  reset(): void {
    this.filled = 0;
    this.fuse = 0;
    this.glow = 0;
    this.material.emissiveIntensity = 0;
    this.block.visible = false;
    this.pieces.forEach((piece, i) => {
      piece.visible = false;
      piece.position.copy(SLOTS[i]);
      this.popped[i] = 0;
    });
  }

  update(dt: number): void {
    this.pieces.forEach((piece, i) => {
      if (i >= this.filled) return;
      this.popped[i] = Math.min(1, this.popped[i] + dt / POP_SECONDS);
      const p = this.popped[i];
      // Overshoot a touch, then settle: a click into place.
      piece.scale.setScalar(Math.max(0.001, p < 1 ? Math.sin(p * Math.PI * 0.75) / Math.sin(Math.PI * 0.75) : 1));
    });
    this.glow = Math.max(0, this.glow - dt * GLOW_DECAY);
    this.material.emissiveIntensity = this.glow * 1.2;
    this.rotation.y += dt * 0.5;
  }

  dispose(): void {
    this.removeFromParent();
    this.material.dispose();
  }
}
