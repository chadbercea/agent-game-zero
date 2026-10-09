import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { SceneHost } from '../stage/Stage';
import { RovoAtlassian } from './rovoAtlassian';
import { rovoInspectables } from './rovoInspect';

function testStage(fps = 30) {
  const DT = 1 / fps;
  const root = new Object3D();
  const ticks = new Set<(dt: number) => void>();
  const stage = {
    add: (...objects: Object3D[]) => root.add(...objects),
    onTick: (fn: (dt: number) => void) => {
      ticks.add(fn);
      return () => void ticks.delete(fn);
    },
  } as unknown as SceneHost;
  const run = async (seconds: number, each: () => void = () => {}) => {
    for (let t = 0; t < seconds; t += DT) {
      for (const fn of [...ticks]) fn(DT);
      each();
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
  };
  return { root, stage, run };
}

describe('Rovo on the Atlassian Grid: interactions', () => {
  it('everything on the grid can be inspected, each with a card built from its live state', async () => {
    const { stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 5);
    const items = rovoInspectables(scene);
    const kinds = new Set<string>();
    let broken = 0;
    void scene.start();
    await run(120, () => {
      for (const item of items()) {
        kinds.add(item.kind);
        if (!(item.card() instanceof HTMLElement)) broken++;
      }
    });
    scene.stop();
    expect(broken).toBe(0);
    for (const kind of ['gate', 'node', 'agent', 'sub-agent', 'line', 'ticket', 'gateway']) expect(kinds).toContain(kind);
    // Copies hold real Jira issues.
    expect(scene.tasks.every((t) => /^DEMO-\d+$/.test(t.key) && t.title.length > 0)).toBe(true);
    expect(new Set(scene.tasks.map((t) => t.key)).size).toBe(scene.tasks.length);
  });
});
