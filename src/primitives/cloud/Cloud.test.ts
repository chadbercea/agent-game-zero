import { describe, expect, it } from 'vitest';
import { Cloud } from './Cloud';

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

  it('has a point under its middle for a hand, and bobs without drifting away', () => {
    const cloud = new Cloud();
    expect(cloud.hand.position.y).toBeLessThan(0);
    for (let i = 0; i < 200; i++) cloud.update(0.05);
    expect(Math.abs(cloud.children[0].position.y)).toBeLessThanOrEqual(0.06 + 1e-9);
  });
});
