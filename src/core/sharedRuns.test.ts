import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { inRun, runsOverlap, sharedRuns } from './sharedRuns';

const v = (x: number, z: number) => new Vector3(x, 0, z);

describe('sharedRuns', () => {
  it('finds two lines on the same grid line', () => {
    expect(
      sharedRuns([
        [v(0, 0), v(6, 0)],
        [v(2, 0), v(8, 0), v(8, 3)],
      ]),
    ).toEqual([{ along: 'x', from: 2, to: 6, low: 0, high: 0 }]);
  });

  it('finds lines a lane apart, spanning both', () => {
    expect(
      sharedRuns([
        [v(0, 0), v(0, 5)],
        [v(0.5, 1), v(0.5, 4)],
      ]),
    ).toEqual([{ along: 'z', from: 1, to: 4, low: 0, high: 0.5 }]);
  });

  it('ignores lines further apart, crossing lines, too-short overlaps, and a line with itself', () => {
    expect(
      sharedRuns([
        [v(0, 0), v(6, 0)],
        [v(0, 1), v(6, 1)],
      ]),
    ).toEqual([]);
    expect(
      sharedRuns([
        [v(0, 0), v(6, 0)],
        [v(3, -3), v(3, 3)],
      ]),
    ).toEqual([]);
    expect(
      sharedRuns([
        [v(0, 0), v(6, 0)],
        [v(5.5, 0), v(9, 0)],
      ]),
    ).toEqual([]);
    expect(sharedRuns([[v(0, 0), v(6, 0), v(6, 2), v(0, 2)]])).toEqual([]);
  });

  it('pulls the ends out of pads, onto grid lines', () => {
    const runs = sharedRuns(
      [
        [v(0, 0), v(6, 0)],
        [v(0, 0), v(6, 0)],
      ],
      [{ center: v(0, 0), half: 0.75 }],
    );
    expect(runs).toEqual([{ along: 'x', from: 1, to: 6, low: 0, high: 0 }]);
  });

  it('knows what is inside a run', () => {
    const run = { along: 'x' as const, from: 1, to: 4, low: 0, high: 0 };
    expect(inRun(run, v(2, 0.2))).toBe(true);
    expect(inRun(run, v(5, 0))).toBe(false);
    expect(inRun(run, v(2, 1))).toBe(false);
  });

  it('knows when two runs overlap', () => {
    const a = { along: 'x' as const, from: 0, to: 4, low: 0, high: 0 };
    expect(runsOverlap(a, { along: 'z', from: -2, to: 2, low: 2, high: 2 })).toBe(true);
    expect(runsOverlap(a, { along: 'z', from: 1, to: 3, low: 2, high: 2 })).toBe(false);
  });
});
