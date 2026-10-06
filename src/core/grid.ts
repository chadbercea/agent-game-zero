import { Vector3 } from 'three';

/** World size of one floor grid cell. Paths and system nodes snap to it. */
export const GRID = 0.5;

/**
 * Bend radius for grid paths: 20px at the sandbox's default zoom. A world
 * axis unit projects to ~0.816 of a screen unit isometrically; the default
 * view is 13 units tall in a ~900px window, so 20px ≈ 0.35 world units.
 */
export const BEND_RADIUS = 0.35;

/**
 * Gates and system nodes sit square on the grid (no rotation) with whole-cell
 * footprints, so every line along a grid axis meets a pad edge head-on and
 * ends exactly at it. Gate: 3 × 3 cells. Node: 2 × 2 cells, centered on a
 * grid point, so its edges lie on grid lines.
 */
export const GATE_FOOTPRINT = 3 * GRID;
export const NODE_FOOTPRINT = 2 * GRID;

/** Turn that squares something up to the isometric camera (drones, emblems, labels; never pads). */
export const FACE_CAMERA = Math.PI / 4;

/** Snap a floor point to the nearest grid intersection (y = 0). */
export function snapToGrid(v: Vector3): Vector3 {
  return new Vector3(Math.round(v.x / GRID) * GRID, 0, Math.round(v.z / GRID) * GRID);
}
