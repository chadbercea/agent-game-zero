import type { Object3D } from 'three';
import type { FloorRect } from './unitLayout';

/**
 * Floor a grounded unit claims: where it stands now, or null while it's too
 * small to count (folded away). Kept on the object's userData under this key,
 * so the grid can find claims without knowing what made them.
 */
export const GROUND_CLAIM = 'groundClaim';
export type GroundClaim = () => FloorRect | null;

let cached: { scene: Object3D; frame: number; rects: FloorRect[] } | undefined;

/**
 * Every floor rectangle claimed by a visible object in `scene` (the grounded
 * units), found once per rendered `frame` and shared by everyone asking in it.
 */
export function groundClaims(scene: Object3D, frame: number): readonly FloorRect[] {
  if (cached?.scene === scene && cached.frame === frame) return cached.rects;
  const rects: FloorRect[] = [];
  scene.traverseVisible((o) => {
    const claim = o.userData[GROUND_CLAIM] as GroundClaim | undefined;
    const rect = claim?.();
    if (rect) rects.push(rect);
  });
  cached = { scene, frame, rects };
  return rects;
}
