import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CURRENCY_CODES, pickCurrency } from '../primitives/currency/Currency';
import { seededRandom } from '../core/scatter';
import type { SceneHost } from '../stage/Stage';
import { ExitLine, exitPlace } from './exitLine';

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
  const run = async (seconds: number, done: () => boolean = () => false) => {
    for (let t = 0; t < seconds && !done(); t += DT) {
      for (const fn of [...ticks]) fn(DT);
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
  };
  return { root, stage, run };
}

describe('Exit portal', () => {
  it('sits opposite the entrance, through the system’s center, its belt running away from the system', () => {
    const center = new Vector3(2, 0, -1);
    const place = exitPlace(center, new Vector3(-2, 0, -1));
    expect(place.portal.distanceTo(new Vector3(6, 0, -1))).toBeLessThan(1e-9);
    expect(place.direction.toArray()).toEqual([1, 0, 0]);
    const above = exitPlace(new Vector3(0, 0, 0), new Vector3(0.5, 0, 3));
    expect(above.portal.z).toBe(-3);
    expect(above.direction.toArray()).toEqual([0, 0, -1]);
  });

  it('a cube that comes out is minted into one of the ten currencies, and lands on the pile', async () => {
    const { stage, run } = testStage();
    const exit = new ExitLine(stage, exitPlace(new Vector3(), new Vector3(-3, 0, 0)), 3);
    const minted: string[] = [];
    for (let i = 0; i < 4; i++) {
      let done = false;
      void exit.emerge().then((code) => {
        minted.push(code);
        done = true;
      });
      await run(20, () => done);
      expect(done).toBe(true);
    }
    expect(minted).toEqual(exit.minted);
    for (const code of minted) expect(CURRENCY_CODES).toContain(code);
  });

  it('picks currencies by seeded RNG, from no more than ten, and all ten turn up', () => {
    const pick = (seed: number) => {
      const random = seededRandom(seed);
      return Array.from({ length: 80 }, () => pickCurrency(random));
    };
    expect(CURRENCY_CODES).toHaveLength(10);
    expect(pick(9)).toEqual(pick(9));
    expect(new Set(pick(9)).size).toBe(10);
  });
});
