import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { NEUTRAL, STATUS_COLOR, type Status } from '../core/palette';
import { BURST_DOTS, SignalLink } from '../primitives/signal/SignalLink';
import { SignalLinkAnimator } from './SignalLinkAnimator';

const DT = 1 / 60;

function setup(status: Status) {
  const link = new SignalLink();
  link.top = 1.7;
  const animator = new SignalLinkAnimator(link);
  animator.status = status;
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) animator.update(DT);
  };
  return { link, animator, run };
}

const heightOf = (mesh: SignalLink['rising'], i: number) => {
  const m = new Matrix4();
  mesh.getMatrixAt(i, m);
  return new Vector3().setFromMatrixPosition(m).y;
};

describe('SignalLinkAnimator', () => {
  it('working: green rises from the base while gray falls from the drone, side by side', () => {
    const { link, run } = setup('working');
    run(1);
    expect(link.rising.count).toBeGreaterThan(5);
    expect(link.falling.count).toBe(link.rising.count);
    expect(link.risingMaterial.opacity).toBeGreaterThan(0.8);
    expect(link.risingMaterial.color.equals(STATUS_COLOR.working)).toBe(true);
    expect(link.fallingMaterial.color.equals(NEUTRAL.packet)).toBe(true);

    // Over a short step the green pattern shifts up and the gray pattern shifts down by
    // flow × time. Dots wrap around the column, so compare modulo the dot spacing.
    const SPACING = 0.1;
    const shift = (a: number, b: number) => (((b - a) % SPACING) + SPACING) % SPACING;
    const up0 = heightOf(link.rising, 0);
    const down0 = heightOf(link.falling, 0);
    run(0.05);
    expect(shift(up0, heightOf(link.rising, 0))).toBeCloseTo(0.6 * 0.05, 2);
    expect(shift(heightOf(link.falling, 0), down0)).toBeCloseTo(0.6 * 0.05, 2);
    expect(link.burst.count).toBe(0);
  });

  it('waiting: quiet, no traffic', () => {
    const { link, run } = setup('waiting');
    run(2);
    expect(link.rising.count).toBe(0);
    expect(link.falling.count).toBe(0);
    expect(link.burst.count).toBe(0);
  });

  it('stopped: one shot of five dots that sink in, turn red, and never come back', () => {
    const { link, animator, run } = setup('working');
    run(1);
    animator.status = 'stopped';
    run(0.3);
    expect(animator.bursting).toBe(true);
    expect(link.burst.count).toBe(BURST_DOTS);
    run(1);
    // The conversation has gone quiet; the shot has landed.
    expect(link.risingMaterial.opacity).toBeLessThan(0.05);
    expect(animator.bursting).toBe(false);
    expect(link.burst.count).toBe(0);
    // And it doesn't repeat while still stopped.
    run(3);
    expect(link.burst.count).toBe(0);
  });

  it('the one-shot dots leave gray and arrive red', () => {
    const { link, run } = setup('stopped');
    run(DT); // first dot just launched
    const early = link.burst.instanceColor!;
    expect(Math.abs(early.getX(0) - NEUTRAL.packet.r)).toBeLessThan(0.05);
    // Late in the first dot's fall it has turned red.
    run(0.55);
    expect(early.getX(0)).toBeGreaterThan(0.8);
    expect(early.getY(0)).toBeLessThan(0.2);
  });

  it('fires again on each new entry into stopped', () => {
    const { animator, run } = setup('stopped');
    run(2);
    expect(animator.bursting).toBe(false);
    animator.status = 'working';
    run(0.5);
    animator.status = 'stopped';
    run(DT);
    expect(animator.bursting).toBe(true);
  });

  it('stays quiet while the drone is not over its base', () => {
    const { link, animator, run } = setup('working');
    animator.active = false;
    run(1);
    expect(link.rising.count).toBe(0);
  });
});

describe('SignalLinkAnimator timing (ILI-909)', () => {
  it('no conversation unless the base allows it (a gate must be open)', () => {
    const { link, animator, run } = setup('working');
    animator.conversing = false;
    run(1);
    expect(link.rising.count).toBe(0);
    animator.conversing = true;
    run(1);
    expect(link.rising.count).toBeGreaterThan(0);
  });

  it('off its base, everything cuts on the very next frame', () => {
    const { link, animator, run } = setup('working');
    run(1);
    expect(link.rising.count).toBeGreaterThan(0);
    animator.active = false;
    run(1 / 60);
    expect(link.rising.count).toBe(0);
    expect(animator.quiet).toBe(true);
  });

  it('closing the conversation clears the dots quickly (well under half a second)', () => {
    const { link, animator, run } = setup('working');
    run(1);
    animator.conversing = false;
    run(0.4);
    expect(link.rising.count).toBe(0);
    expect(animator.quiet).toBe(true);
  });

  it('a one-shot in flight is cut if the drone leaves', () => {
    const { link, animator, run } = setup('stopped');
    run(0.1);
    expect(animator.bursting).toBe(true);
    animator.active = false;
    run(1 / 60);
    expect(link.burst.count).toBe(0);
  });
});
