import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import { GROUND_CLAIM, groundClaims } from './groundClaims';

describe('groundClaims', () => {
  it('collects claims from visible objects only, skipping folded ones', () => {
    const scene = new Group();
    const rect = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
    const up = new Group();
    up.userData[GROUND_CLAIM] = () => rect;
    const folded = new Group();
    folded.userData[GROUND_CLAIM] = () => null;
    const hidden = new Group();
    hidden.userData[GROUND_CLAIM] = () => rect;
    hidden.visible = false;
    scene.add(up, folded, hidden);
    expect(groundClaims(scene, 1)).toEqual([rect]);
  });

  it('looks once per frame', () => {
    const scene = new Group();
    let calls = 0;
    const o = new Group();
    o.userData[GROUND_CLAIM] = () => {
      calls++;
      return null;
    };
    scene.add(o);
    groundClaims(scene, 7);
    groundClaims(scene, 7);
    groundClaims(scene, 8);
    expect(calls).toBe(2);
  });
});
