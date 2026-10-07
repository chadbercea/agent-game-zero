import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Hand, MAX_REACH, WAVE } from './Hand';

describe('Hand', () => {
  it('is tucked away at reach 0 and reaches its full length at 1', () => {
    const hand = new Hand();
    expect(hand.visible).toBe(false);
    hand.reach = 1;
    hand.updateMatrixWorld(true);
    const at = hand.socket.getWorldPosition(new Vector3());
    expect(hand.visible).toBe(true);
    expect(-at.y).toBeCloseTo(hand.depth, 5);
    expect(hand.depth).toBeGreaterThan(MAX_REACH);
  });

  it('the held point follows the reach down', () => {
    const hand = new Hand();
    const depth = (r: number) => {
      hand.reach = r;
      hand.updateMatrixWorld(true);
      return -hand.socket.getWorldPosition(new Vector3()).y;
    };
    expect(depth(0.8)).toBeGreaterThan(depth(0.4));
  });

  it('grip and wave stay in range', () => {
    const hand = new Hand();
    hand.grip = 3;
    expect(hand.grip).toBe(1);
    hand.wave = 9;
    expect(hand.wave).toBe(WAVE);
    hand.wave = -9;
    expect(hand.wave).toBe(-WAVE);
  });
});
