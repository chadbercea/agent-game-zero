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

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function easeOutBack(t: number): number {
  const c = 1.6;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
