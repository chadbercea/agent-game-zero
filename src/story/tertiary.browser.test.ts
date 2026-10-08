import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { TERTIARY_SCALE, Tertiaries } from './tertiary';

function testStage() {
  const root = new Object3D();
  const ticks = new Set<(dt: number) => void>();
  const stage = {
    add: (...o: Object3D[]) => root.add(...o),
    onTick: (fn: (dt: number) => void) => {
      ticks.add(fn);
      return () => void ticks.delete(fn);
    },
  } as unknown as SceneHost;
  const run = async (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 30) {
      for (const fn of [...ticks]) fn(1 / 30);
      for (let i = 0; i < 4; i++) await Promise.resolve();
    }
  };
  return { root, stage, run };
}

const onStage = (root: Object3D) => root.children.filter((o): o is SystemNode => o instanceof SystemNode);

describe('Tertiaries', () => {
  it('gives the first agent the tool and every agent after it a smaller tertiary of its own, feeding the tool', async () => {
    const { root, stage, run } = testStage();
    const tool = new SystemNode({ kind: 'bitbucket' });
    stage.add(tool);
    const tertiaries = new Tertiaries(stage, () => [tool.position]);
    const claims = [0, 1, 2, 3].map(() => tertiaries.claim(tool));
    expect(claims[0].tertiary).toBeNull();
    expect(claims[0].spot.distanceTo(tool.position)).toBe(0);
    expect(claims.slice(1).every((c) => c.tertiary?.kind === 'bitbucket')).toBe(true);
    expect(tertiaries.count).toBe(3);
    // Each on a spot of its own, clear of the tool and each other.
    const spots = claims.map((c) => c.spot);
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(spots[i].distanceTo(spots[j])).toBeGreaterThanOrEqual(1);
    await run(2);
    for (const c of claims.slice(1)) expect(c.tertiary!.scale.x).toBeCloseTo(TERTIARY_SCALE, 3);
    // Work flows in: products on stage riding the traces.
    await run(1.5);
    expect(root.children.some((o) => o.constructor.name === 'Product')).toBe(true);
  });

  it('takes a tertiary away when its work ends, and puts it back in the same place next time', async () => {
    const { root, stage, run } = testStage();
    const tool = new SystemNode({ kind: 'github' });
    stage.add(tool);
    const tertiaries = new Tertiaries(stage, () => [tool.position]);
    const first = tertiaries.claim(tool);
    const second = tertiaries.claim(tool);
    const where = second.spot.clone();
    await run(1.5);
    second.release();
    second.release();
    await run(1);
    expect(tertiaries.count).toBe(0);
    expect(onStage(root)).toEqual([tool]);
    const again = tertiaries.claim(tool);
    expect(again.tertiary).not.toBeNull();
    expect(again.spot.distanceTo(where)).toBe(0);
    first.release();
    again.release();
    tertiaries.clear();
    await run(1);
    expect(onStage(root)).toEqual([tool]);
  });
});
