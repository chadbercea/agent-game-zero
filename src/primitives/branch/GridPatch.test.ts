import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GridPatch } from './GridPatch';

/** Highest alpha of any grid vertex inside `[x0, x1] × [z0, z1]`. */
function maxAlphaIn(patch: GridPatch, x0: number, x1: number, z0: number, z1: number): number {
  const position = patch.geometry.getAttribute('position');
  const color = patch.geometry.getAttribute('color');
  let max = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) max = Math.max(max, color.getW(i));
  }
  return max;
}

describe('GridPatch clearing', () => {
  const path = [new Vector3(-3, 0, 0), new Vector3(3, 0, 0)];
  const unit = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };

  it('keeps the grid off a claimed rectangle and fades back in outside it', () => {
    const patch = new GridPatch(path);
    expect(maxAlphaIn(patch, -1, 1, -1, 1)).toBeGreaterThan(0.1);
    patch.clearFor([unit]);
    expect(maxAlphaIn(patch, -1, 1, -1, 1)).toBe(0);
    expect(maxAlphaIn(patch, 2.5, 3, -0.5, 0.5)).toBeGreaterThan(0.1);
  });

  it('brings the grid back when the claim goes', () => {
    const patch = new GridPatch(path);
    const before = maxAlphaIn(patch, -1, 1, -1, 1);
    patch.clearFor([unit]);
    patch.clearFor([]);
    expect(maxAlphaIn(patch, -1, 1, -1, 1)).toBeCloseTo(before);
  });
});
