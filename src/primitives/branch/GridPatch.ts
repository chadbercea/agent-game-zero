import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, type Vector3 } from 'three';
import { GRID } from '../../core/grid';
import { groundClaims } from '../unit/groundClaims';
import { distanceToRect, type FloorRect } from '../unit/unitLayout';
import { distanceToPolyline } from './gridPath';

const LINE_COLOR = [0.62, 0.64, 0.69];
/** Grid lines are drawn in short pieces so their alpha can fade smoothly along them. */
const PIECE = GRID / 4;

/**
 * The faint floor grid around a path: grid lines near the path, fading to
 * white with distance from it. `opacity` (0–1) fades the whole patch, so it
 * can come and go with its branch. It stays off the floor any grounded unit
 * claims (groundClaims), fading back in over one grid square outside it, and
 * follows the units as they come and go.
 */
export class GridPatch extends LineSegments<BufferGeometry, LineBasicMaterial> {
  /** Each vertex's alpha before any unit clears it. */
  private readonly baseAlpha: Float32Array;
  /** The claims the alphas were last cleared for, as a key. */
  private clearedFor = '';

  constructor(path: Vector3[], reach = 2.2, strength = 0.5) {
    const xs = path.map((p) => p.x);
    const zs = path.map((p) => p.z);
    const snapDown = (v: number) => Math.floor(v / GRID) * GRID;
    const snapUp = (v: number) => Math.ceil(v / GRID) * GRID;
    const minX = snapDown(Math.min(...xs) - reach);
    const maxX = snapUp(Math.max(...xs) + reach);
    const minZ = snapDown(Math.min(...zs) - reach);
    const maxZ = snapUp(Math.max(...zs) + reach);

    const positions: number[] = [];
    const colors: number[] = [];
    const alphaAt = (x: number, z: number) => {
      const d = distanceToPolyline(x, z, path);
      return strength * Math.max(0, 1 - d / reach) ** 2;
    };
    const piece = (x0: number, z0: number, x1: number, z1: number) => {
      const a0 = alphaAt(x0, z0);
      const a1 = alphaAt(x1, z1);
      if (a0 <= 0.002 && a1 <= 0.002) return;
      positions.push(x0, 0.004, z0, x1, 0.004, z1);
      colors.push(...LINE_COLOR, a0, ...LINE_COLOR, a1);
    };
    for (let x = minX; x <= maxX + 1e-6; x += GRID) {
      for (let z = minZ; z < maxZ - 1e-6; z += PIECE) piece(x, z, x, z + PIECE);
    }
    for (let z = minZ; z <= maxZ + 1e-6; z += GRID) {
      for (let x = minX; x < maxX - 1e-6; x += PIECE) piece(x, z, x + PIECE, z);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 4));
    super(geometry, new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 0 }));
    this.renderOrder = -2;
    this.frustumCulled = false;
    this.baseAlpha = Float32Array.from({ length: colors.length / 4 }, (_, i) => colors[i * 4 + 3]);
    this.onBeforeRender = (renderer, scene) => this.clearFor(groundClaims(scene, renderer.info.render.frame));
  }

  /** Clear the grid off `rects` (and only them), if they've changed since last time. */
  clearFor(rects: readonly FloorRect[]): void {
    const key = rects.map((r) => `${r.minX},${r.maxX},${r.minZ},${r.maxZ}`).join(';');
    if (key === this.clearedFor) return;
    this.clearedFor = key;
    const position = this.geometry.getAttribute('position');
    const color = this.geometry.getAttribute('color');
    for (let i = 0; i < this.baseAlpha.length; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const kept = rects.reduce((k, rect) => Math.min(k, distanceToRect(x, z, rect) / GRID), 1);
      color.setW(i, this.baseAlpha[i] * kept);
    }
    color.needsUpdate = true;
  }

  get opacity(): number {
    return this.material.opacity;
  }

  set opacity(value: number) {
    this.material.opacity = value;
    this.visible = value > 0.005;
  }

  dispose(): void {
    this.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
