import { Vector3 } from 'three';
import { GRID, NODE_FOOTPRINT } from '../../core/grid';

/** An axis-aligned rectangle on the floor. */
export interface FloorRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Which way a unit's panel grows from its node: along X (right of it) or Z (below it). */
export type PanelDirection = 'x' | 'z';

/** A side of a unit's border, by the way it faces. */
export type BorderSide = '-x' | '+x' | '-z' | '+z';

/** Space between the border and what it wraps, and between the node and its panel: half a grid square. */
export const UNIT_MARGIN = GRID / 2;
/** The panel's long side. A plain node is 2 / 5 of it (ILI-1070: 1/3 to 1/2). */
export const PANEL_LENGTH = 2.5 * NODE_FOOTPRINT;
/** The panel's short side: as deep as a plain node. */
export const PANEL_DEPTH = NODE_FOOTPRINT;

export interface UnitLayout {
  node: FloorRect;
  panel: FloorRect;
  border: FloorRect;
}

/**
 * Where a grounded unit's parts lie, in the unit's own frame: the node
 * centered on the origin (its edges on grid lines, as every node's are), the
 * panel beside it or below it, and the border around both. The node keeps its
 * corner whichever way the panel goes; the panel is the same landscape strip
 * either way, so it always reads the same way up. `nodeSize` is the node's
 * width as it stands (a hub stands bigger than a plain node).
 */
export function unitLayout(direction: PanelDirection, nodeSize = NODE_FOOTPRINT): UnitLayout {
  const h = nodeSize / 2;
  const node = { minX: -h, maxX: h, minZ: -h, maxZ: h };
  const panel =
    direction === 'x'
      ? { minX: h + UNIT_MARGIN, maxX: h + UNIT_MARGIN + PANEL_LENGTH, minZ: -h, maxZ: -h + PANEL_DEPTH }
      : { minX: -h, maxX: -h + PANEL_LENGTH, minZ: h + UNIT_MARGIN, maxZ: h + UNIT_MARGIN + PANEL_DEPTH };
  const border = {
    minX: Math.min(node.minX, panel.minX) - UNIT_MARGIN,
    maxX: Math.max(node.maxX, panel.maxX) + UNIT_MARGIN,
    minZ: Math.min(node.minZ, panel.minZ) - UNIT_MARGIN,
    maxZ: Math.max(node.maxZ, panel.maxZ) + UNIT_MARGIN,
  };
  return { node, panel, border };
}

/** `rect` moved by `(x, z)`. */
export function offsetRect(rect: FloorRect, x: number, z: number): FloorRect {
  return { minX: rect.minX + x, maxX: rect.maxX + x, minZ: rect.minZ + z, maxZ: rect.maxZ + z };
}

/**
 * Where a line running on the grid line `at` meets the `side` of `border`.
 * A side facing ±X is met by a line along X, so `at` is a Z grid line; a side
 * facing ±Z is met by a line along Z, so `at` is an X grid line. Throws if
 * `at` is off the grid or misses the side.
 */
export function attachPoint(border: FloorRect, side: BorderSide, at: number): Vector3 {
  if (Math.abs(at / GRID - Math.round(at / GRID)) > 1e-6) throw new Error(`attach point ${at} is not on a grid line`);
  const alongZ = side === '-x' || side === '+x';
  const [lo, hi] = alongZ ? [border.minZ, border.maxZ] : [border.minX, border.maxX];
  if (at <= lo || at >= hi) throw new Error(`attach point ${at} misses the ${side} side (${lo} to ${hi})`);
  switch (side) {
    case '-x':
      return new Vector3(border.minX, 0, at);
    case '+x':
      return new Vector3(border.maxX, 0, at);
    case '-z':
      return new Vector3(at, 0, border.minZ);
    case '+z':
      return new Vector3(at, 0, border.maxZ);
  }
}

/** `rect` scaled by `k` about the origin (a unit folding into its node). */
export function scaleRect(rect: FloorRect, k: number): FloorRect {
  return { minX: rect.minX * k, maxX: rect.maxX * k, minZ: rect.minZ * k, maxZ: rect.maxZ * k };
}

/** Where a line leaves a unit: the side of its border and the point on it. */
export interface Attachment {
  side: BorderSide;
  point: Vector3;
}

/**
 * Attach points for lines leaving `border` toward each of `targets`, in
 * order: each on the side that faces its target (the axis it's farther out
 * along), at the grid line on that side nearest the target, and never on a
 * point an earlier line took. Throws if a target is over the border or a
 * side runs out of grid lines.
 */
export function pickAttachments(border: FloorRect, targets: readonly Vector3[]): Attachment[] {
  const taken = new Set<string>();
  return targets.map((t) => {
    const outX = Math.max(border.minX - t.x, 0, t.x - border.maxX);
    const outZ = Math.max(border.minZ - t.z, 0, t.z - border.maxZ);
    if (outX === 0 && outZ === 0) throw new Error(`target (${t.x}, ${t.z}) is over the border`);
    const side: BorderSide =
      outX >= outZ ? (t.x > border.maxX ? '+x' : '-x') : t.z > border.maxZ ? '+z' : '-z';
    const alongZ = side === '-x' || side === '+x';
    const [lo, hi] = alongZ ? [border.minZ, border.maxZ] : [border.minX, border.maxX];
    const want = alongZ ? t.z : t.x;
    const lines: number[] = [];
    for (let i = Math.floor(lo / GRID) + 1; i * GRID < hi - 1e-6; i++) if (i * GRID > lo + 1e-6) lines.push(i * GRID);
    const free = lines.filter((at) => !taken.has(`${side}:${at}`)).sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
    if (!free.length) throw new Error(`no free grid line on the ${side} side`);
    taken.add(`${side}:${free[0]}`);
    return { side, point: attachPoint(border, side, free[0]) };
  });
}

/** Distance from a floor point to `rect` (0 inside it). */
export function distanceToRect(x: number, z: number, rect: FloorRect): number {
  const dx = Math.max(rect.minX - x, 0, x - rect.maxX);
  const dz = Math.max(rect.minZ - z, 0, z - rect.maxZ);
  return Math.hypot(dx, dz);
}
