import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { RovoFeature } from './rovoFeature';
import { fastForward } from '../stage/fastForward';
import type { SceneHost } from '../stage/Stage';

/** A stage with no renderer: ticks only. */
function fakeStage() {
  const ticks = new Set<(dt: number) => void>();
  const root = new Object3D();
  const stage = {
    add: (...objects: Object3D[]) => root.add(...objects),
    onTick: (fn: (dt: number) => void) => {
      ticks.add(fn);
      return () => void ticks.delete(fn);
    },
  } as unknown as SceneHost;
  const tick = (dt: number) => {
    for (const fn of [...ticks]) fn(dt);
  };
  return { stage, tick };
}

describe('fastForward on a story', () => {
  it('opens a story at a beat in the same state as playing up to it', async () => {
    const state = async (seed: number, skip: boolean) => {
      const { stage, tick } = fakeStage();
      const scene = new RovoFeature(stage, seed);
      void scene.start();
      if (skip) await fastForward(tick, { until: () => scene.beat === 'build' });
      else for (let n = 0; scene.beat !== 'build' && n < 30 * 600; n++) {
        tick(1 / 30);
        for (let i = 0; i < 6; i++) await Promise.resolve();
      }
      return { beat: scene.beat, mcpReads: scene.mcpReads, reports: scene.userReports, tasks: scene.tasks.map((t) => `${t.key} ${t.done}`) };
    };
    const skipped = await state(4, true);
    expect(skipped.beat).toBe('build');
    // The spec is written and the user told before the build starts.
    expect(skipped.mcpReads).toBe(1);
    expect(skipped.reports).toBe(1);
    expect(skipped).toEqual(await state(4, false));
  });
});
