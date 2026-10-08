import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../core/scatter';
import { Cloud, CLOUD_SHAPES, pickCloudShape } from './Cloud';

const puffs = (c: Cloud) => c.children[0].children.filter((o) => o.type === 'Mesh');

describe('Cloud', () => {
  it('is nothing at 0, a whole cloud at 1', () => {
    const cloud = new Cloud();
    cloud.materialized = 0;
    expect(puffs(cloud).every((p) => !p.visible)).toBe(true);
    cloud.materialized = 1;
    expect(puffs(cloud).every((p) => p.visible && p.scale.x > 0.25)).toBe(true);
  });

  it('pops in middle-first: partway, the big middle puff is in before the small ends', () => {
    const cloud = new Cloud();
    cloud.materialized = 0.2;
    const visible = puffs(cloud).map((p) => p.visible);
    expect(visible[0]).toBe(true); // the middle
    expect(visible[5] || visible[6]).toBe(false); // the ends
  });

  it('bobs without drifting away', () => {
    const cloud = new Cloud();
    for (let i = 0; i < 200; i++) cloud.update(0.05);
    expect(Math.abs(cloud.children[0].position.y)).toBeLessThanOrEqual(0.06 + 1e-9);
  });
});

describe('Cloud shapes', () => {
  it('has five distinct shapes', () => {
    expect(CLOUD_SHAPES).toHaveLength(5);
    const silhouettes = CLOUD_SHAPES.map((spec) => spec.map((p) => `${p.x},${p.y},${p.r}`).join('|'));
    expect(new Set(silhouettes).size).toBe(5);
  });

  it('every shape behaves the same: nothing at 0, whole at 1, middle first, a steady bob', () => {
    for (let shape = 0; shape < CLOUD_SHAPES.length; shape++) {
      const cloud = new Cloud({ shape });
      cloud.materialized = 0;
      expect(puffs(cloud).every((p) => !p.visible)).toBe(true);
      cloud.materialized = 0.2;
      expect(puffs(cloud)[0].visible).toBe(true);
      cloud.materialized = 1;
      expect(puffs(cloud).every((p) => p.visible)).toBe(true);
      for (let i = 0; i < 100; i++) cloud.update(0.05);
      expect(Math.abs(cloud.children[0].position.y)).toBeLessThanOrEqual(0.06 + 1e-9);
    }
  });

  it('reshapes in place, keeping how far it has materialized', () => {
    const cloud = new Cloud();
    cloud.materialized = 1;
    cloud.shape = 2;
    expect(puffs(cloud)).toHaveLength(CLOUD_SHAPES[2].length);
    expect(puffs(cloud).every((p) => p.visible)).toBe(true);
  });

  it('picks shapes by seeded RNG: the same seed, the same shapes; over a run, all five turn up', () => {
    const pick = (seed: number) => {
      const random = seededRandom(seed);
      return Array.from({ length: 40 }, () => pickCloudShape(random));
    };
    expect(pick(3)).toEqual(pick(3));
    expect(new Set(pick(3)).size).toBe(5);
  });
});
