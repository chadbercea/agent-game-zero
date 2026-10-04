import { Vector3 } from 'three';
import { Stage, type StageOptions } from './Stage';

/** World direction that reads as screen-right from the isometric camera. */
export const SCREEN_RIGHT = new Vector3(1, 0, -1).normalize();

let current: Stage | undefined;

/**
 * Mount a fresh Stage for a Storybook specimen, disposing the previous one so
 * switching stories never leaks WebGL contexts.
 */
export function specimenStage(options: StageOptions & { focusY?: number } = {}): { root: HTMLElement; stage: Stage } {
  current?.dispose();
  const root = document.createElement('div');
  root.style.width = '100%';
  root.style.height = '100vh';
  // Not in the DOM yet; Stage's ResizeObserver sizes it once Storybook attaches it.
  const stage = new Stage(root, options);
  stage.centerOn(new Vector3(0, options.focusY ?? 1.7, 0));
  current = stage;
  return { root, stage };
}

/** Floor position `i` steps along screen-right, centered on the row. */
export function rowPosition(i: number, count: number, spacing: number): { x: number; z: number } {
  const offset = (i - (count - 1) / 2) * spacing;
  return { x: SCREEN_RIGHT.x * offset, z: SCREEN_RIGHT.z * offset };
}
