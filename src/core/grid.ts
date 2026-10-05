import { Vector3 } from 'three';

/** World size of one floor grid cell. Paths and system nodes snap to it. */
export const GRID = 0.5;

/**
 * Bend radius for grid paths: 20px at the sandbox's default zoom. A world
 * axis unit projects to ~0.816 of a screen unit isometrically; the default
 * view is 13 units tall in a ~900px window, so 20px ≈ 0.35 world units.
 */
export const BEND_RADIUS = 0.35;

/** Snap a floor point to the nearest grid intersection (y = 0). */
export function snapToGrid(v: Vector3): Vector3 {
  return new Vector3(Math.round(v.x / GRID) * GRID, 0, Math.round(v.z / GRID) * GRID);
}
