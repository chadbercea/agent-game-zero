import { describe, expect, it } from 'vitest';
import { fastForward } from './fastForward';

describe('fastForward', () => {
  it('stops after `seconds` of stage time', async () => {
    let ticks = 0;
    expect(await fastForward(() => ticks++, { seconds: 2, step: 0.5 })).toBe(2);
    expect(ticks).toBe(4);
  });

  it('stops as soon as `until` holds', async () => {
    let ticks = 0;
    const skipped = await fastForward(() => ticks++, { until: () => ticks === 3, step: 1 });
    expect(skipped).toBe(3);
  });
});
