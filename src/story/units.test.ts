import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { borderAt, cutToBorders } from './units';

const v = (x: number, z: number) => new Vector3(x, 0, z);

describe('cutToBorders (ILI-1073): lines end on unit borders', () => {
  const a = borderAt(v(0, 0), 1, 'x'); // x −0.75…3.5, z −0.75…0.75
  const b = borderAt(v(8, 3), 1, 'z'); // x 7.25…10.25, z 2.25…5

  it('cuts each end where the line meets the border it starts or ends in', () => {
    const line = cutToBorders([v(0, 0), v(0, 3), v(8, 3)], a, b);
    expect(line[0].toArray()).toEqual([0, 0, 0.75]);
    expect(line[1].toArray()).toEqual([0, 0, 3]);
    expect(line[2].toArray()).toEqual([7.25, 0, 3]);
  });

  it('runs through its own panel to the far border when it leaves that way', () => {
    const [from] = cutToBorders([v(0, 0), v(6, 0)], a, 0);
    expect(from.toArray()).toEqual([3.5, 0, 0]);
  });

  it('trims by a fixed amount at an end with no panel', () => {
    const line = cutToBorders([v(0, 0), v(6, 0)], a, 0.5);
    expect(line[line.length - 1].toArray()).toEqual([5.5, 0, 0]);
  });
});
