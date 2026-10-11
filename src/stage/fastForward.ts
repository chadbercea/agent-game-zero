/** How a fast-forward runs: until `until()` holds or `seconds` of stage time pass, whichever comes first. */
export interface SkipOptions {
  until?: () => boolean;
  seconds?: number;
  /** The fixed clock step (stage seconds per tick). */
  step?: number;
}

/**
 * Fast-forward: call `tick` at a fixed step, without waiting for frames,
 * letting story promises settle between ticks, until `until()` holds or
 * `seconds` pass (10 minutes at most). Yields to the page now and then so it
 * stays responsive. Resolves with the stage seconds skipped.
 */
export async function fastForward(tick: (dt: number) => void, { until = () => false, seconds = 600, step = 1 / 30 }: SkipOptions): Promise<number> {
  let skipped = 0;
  for (let n = 1; skipped < seconds && !until(); n++) {
    tick(step);
    skipped += step;
    // Story steps chain a few promises deep; let them all run before the next tick.
    for (let i = 0; i < 6; i++) await Promise.resolve();
    if (n % 300 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return skipped;
}
