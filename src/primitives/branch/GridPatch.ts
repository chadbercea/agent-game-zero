import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, type Vector3 } from 'three';
import { GRID } from '../../core/grid';
import { distanceToPolyline } from './gridPath';

const LINE_COLOR = [0.62, 0.64, 0.69];
/** Grid lines are drawn in short pieces so their alpha can fade smoothly along them. */
const PIECE = GRID / 4;

/**
 * The faint floor grid around a path: grid lines near the path, fading to
 * white with distance from it. `opacity` (0–1) fades the whole patch, so it
 * can come and go with its branch.
 */
export class GridPatch extends LineSegments<BufferGeometry, LineBasicMaterial> {
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
