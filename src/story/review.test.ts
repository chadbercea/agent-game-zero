import { Object3D, Vector3 } from 'three';
import type { GateState } from '../primitives/gate/Gate';
import { describe, expect, it } from 'vitest';
import type { SceneHost } from '../stage/Stage';
import { DEMO_1, WorkLedger } from './ledger';
import { Review, type ReviewGate } from './review';

type Tick = (dt: number, elapsed: number) => void;

function setup(seed = 2) {
  const ticks: Tick[] = [];
  let elapsed = 0;
  const stage = { onTick: (fn: Tick) => (ticks.push(fn), () => {}), add: () => {} } as unknown as SceneHost;
  const ledger = new WorkLedger(seed);
  const gate = Object.assign(new Object3D(), { state: 'off' as GateState }) as ReviewGate;
  const review = new Review(stage, new Vector3(2, 0, 4.5), new Vector3(2, 0, 2), ledger, seed, { gate });
  review.open = true;
  const run = async (seconds: number, step = 0.05) => {
    for (let t = 0; t < seconds; t += step) {
      elapsed += step;
      for (const fn of [...ticks]) fn(step, elapsed);
      await Promise.resolve();
    }
  };
  return { review, ledger, run };
}

const item = (n: number) => ({ key: `DEMO-${900 + n}`, title: 'Some request' });

describe('Review', () => {
  it('thinks, then gives the forced verdict, and writes it to the ledger', async () => {
    const { review, ledger, run } = setup();
    const states: string[] = [];
    const verdict = review.submit(DEMO_1, 'bitbucket', 'denied');
    for (let i = 0; i < 40; i++) {
      await run(0.05);
      if (states.at(-1) !== review.gate.state) states.push(review.gate.state);
    }
    await expect(verdict).resolves.toBe('denied');
    expect(states).toEqual(['off', 'thinking', 'denied', 'off']);
    expect(ledger.verdictOf(DEMO_1.key)).toBe('denied');
    expect(review.summary().recent[0]).toMatchObject({ key: DEMO_1.key, verdict: 'denied' });
  });

  it('reviews every submission; most go green', async () => {
    const { review, run } = setup();
    const verdicts = Array.from({ length: 80 }, (_, n) => review.submit(item(n)));
    await run(120);
    const all = await Promise.all(verdicts);
    const s = review.summary();
    expect(s.reviewed).toBe(80);
    expect(s.confirmed + s.denied).toBe(80);
    expect(all.filter((v) => v === 'confirmed').length).toBeGreaterThan(70);
  });

  it('keeps up with volume: reviews faster when work piles up, and counts the overflow without drawing it', async () => {
    const { review, run } = setup();
    for (let n = 0; n < 30; n++) void review.submit(item(n));
    expect(review.waiting).toBeLessThanOrEqual(10);
    expect(review.summary().reviewed).toBe(20); // 20 overflowed and were reviewed straight away
    await run(4);
    // At full pace (1.7s each) 4s would review 2; piled up, it goes faster.
    expect(review.summary().reviewed).toBeGreaterThan(22);
  });

  it('takes nothing while closed except forced verdicts, and reset clears the queue', async () => {
    const { review, run } = setup();
    review.open = false;
    await expect(review.submit(item(1))).resolves.toBe('confirmed');
    expect(review.summary().reviewed).toBe(0);
    const forced = review.submit(DEMO_1, undefined, 'confirmed');
    await run(2);
    await expect(forced).resolves.toBe('confirmed');
    review.open = true;
    for (let n = 0; n < 5; n++) void review.submit(item(n));
    review.reset();
    expect(review.waiting).toBe(0);
    expect(review.gate.state).toBe('off');
  });

  it('records the verdict even when one long frame skips past the whole review', async () => {
    const { review, ledger, run } = setup();
    const verdict = review.submit(DEMO_1, 'bitbucket', 'confirmed');
    await run(0.05);
    await run(3, 3);
    await expect(verdict).resolves.toBe('confirmed');
    expect(ledger.verdictOf(DEMO_1.key)).toBe('confirmed');
    expect(review.summary().reviewed).toBe(1);
  });
});
