import { describe, expect, it } from 'vitest';
import { GATEWAY_SHAKE, Gateway } from './Gateway';

const RUN = { along: 'x' as const, from: -1.5, to: 1.5, low: -0.5, high: 0.5 };

/** The biggest sway over `seconds` after an entry. */
function peak(g: Gateway, seconds: number, from = 0): number {
  let max = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    g.update(1 / 60);
    if (t >= from) max = Math.max(max, Math.abs(g.sway));
  }
  return max;
}

describe('Gateway entry shake', () => {
  it('sways when something enters, restrained by default, and settles', () => {
    const g = new Gateway(RUN);
    expect(g.sway).toBe(0);
    g.grant();
    expect(peak(g, 0.6)).toBeLessThanOrEqual(GATEWAY_SHAKE.amplitude);
    expect(GATEWAY_SHAKE.amplitude).toBeLessThan(0.2);
    // Settled after a couple of seconds.
    expect(peak(g, 3, 2)).toBeLessThan(0.002);
  });

  it('is a tunable parameter: amplitude, frequency, damping', () => {
    const calm = new Gateway(RUN);
    calm.shake = { amplitude: 0, frequency: 2, damping: 3 };
    calm.grant();
    expect(peak(calm, 1)).toBe(0);
    const big = new Gateway(RUN);
    big.shake = { amplitude: 0.5, frequency: 2, damping: 1 };
    big.grant();
    expect(peak(big, 0.5)).toBeGreaterThan(0.3);
    const slow = new Gateway(RUN);
    slow.shake = { amplitude: 0.2, frequency: 2, damping: 0.5 };
    slow.grant();
    expect(peak(slow, 3, 2)).toBeGreaterThan(0.05);
  });
});
