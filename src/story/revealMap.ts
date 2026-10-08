import type { Object3D } from 'three';
import type { SceneHost } from '../stage/Stage';
import type { SystemMap } from './SystemMap';
import { tween, wait } from './timeline';

export const DRAW_SECONDS = 0.9;
export const RISE_SECONDS = 0.6;
export const STAGGER_SECONDS = 0.3;
/** How long the freshly drawn map stays lined before the lines fade away. */
export const LINGER_SECONDS = 1.4;

/**
 * The system map reveal (story step 4), played on green: branches draw out
 * from the gate one after another, and each node rises from the floor as its
 * branch reaches it. Once the whole map is up, the lines linger, then fade:
 * they're never persistent (project decision 3).
 */
export async function revealMap(stage: Pick<SceneHost, 'onTick'>, map: SystemMap): Promise<void> {
  map.hide();
  map.setLineLevel(1);
  await Promise.all(
    map.branches.map(async (branch, i) => {
      await wait(stage, i * STAGGER_SECONDS);
      await tween(stage, DRAW_SECONDS, (t) => (branch.drawn = easeOutCubic(t)));
      await tween(stage, RISE_SECONDS, (t) => map.setRise(i, easeOutBack(t)));
    }),
  );
  map.revealed = true;
  map.linesVisible = true;
  await wait(stage, LINGER_SECONDS);
  map.linesVisible = false;
}

/**
 * One node called up on its own (an agent calls it): its branch draws out
 * from the gate over its patch of faint grid, and the node rises as the line
 * reaches it. Resolves once the node is up; the line and grid linger, then
 * fade, on their own. A node already up resolves at once.
 */
export async function revealNode(stage: Pick<SceneHost, 'onTick'>, map: SystemMap, i: number): Promise<void> {
  if (map.nodes[i].visible) return;
  map.setCalling(i, true);
  const branch = map.branches[i];
  await tween(stage, DRAW_SECONDS, (t) => (branch.drawn = easeOutCubic(t)));
  await tween(stage, RISE_SECONDS, (t) => map.setRise(i, easeOutBack(t)));
  void wait(stage, LINGER_SECONDS).then(() => map.setCalling(i, false));
}

/** A gate called up: it pops up out of the floor. Already up: resolves at once. */
export async function revealGate(stage: Pick<SceneHost, 'onTick'>, gate: Object3D): Promise<void> {
  if (gate.visible) return;
  gate.visible = true;
  await tween(stage, RISE_SECONDS, (t) => gate.scale.setScalar(Math.max(0.001, easeOutBack(t))));
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
