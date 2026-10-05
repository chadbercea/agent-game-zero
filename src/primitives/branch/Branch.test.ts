import { Color, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Branch, branchCurve } from './Branch';

describe('Branch', () => {
  it('curves from start to end on the floor, bowing to one side', () => {
    const curve = branchCurve(new Vector3(0, 0, 0), new Vector3(10, 0, 0), 0.2);
    expect(curve.getPoint(0).distanceTo(new Vector3(0, 0, 0))).toBeLessThan(1e-9);
    expect(curve.getPoint(1).distanceTo(new Vector3(10, 0, 0))).toBeLessThan(1e-9);
    const mid = curve.getPoint(0.5);
    expect(Math.abs(mid.z)).toBeGreaterThan(0.5); // bowed, not straight
    expect(mid.y).toBe(0);
    // Opposite bend bows to the other side.
    expect(Math.sign(branchCurve(new Vector3(), new Vector3(10, 0, 0), -0.2).getPoint(0.5).z)).toBe(-Math.sign(mid.z));
  });

  it('draws from the start outward', () => {
    const branch = new Branch(branchCurve(new Vector3(), new Vector3(5, 0, 0)), new Color('#888'));
    expect(branch.drawn).toBe(0);
    branch.drawn = 0.5;
    expect(branch.drawn).toBe(0.5);
    branch.drawn = 3;
    expect(branch.drawn).toBe(1);
  });
});
