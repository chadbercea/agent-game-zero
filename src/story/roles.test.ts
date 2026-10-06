import { describe, expect, it } from 'vitest';
import { assignRoles } from './roles';

describe('assignRoles', () => {
  const canTravel = [true, true, true, true, true, true, false];

  it('gives every run at least one of each role', () => {
    for (let seed = 1; seed < 60; seed++) {
      const roles = assignRoles(canTravel, seed);
      expect(new Set(roles)).toEqual(new Set(['stay', 'despawn', 'travel']));
    }
  });

  it('never sends a sub-agent with nowhere to go traveling', () => {
    for (let seed = 1; seed < 60; seed++) expect(assignRoles(canTravel, seed)[6]).not.toBe('travel');
  });

  it('varies by seed and repeats for the same seed', () => {
    expect(assignRoles(canTravel, 3)).toEqual(assignRoles(canTravel, 3));
    const runs = new Set(Array.from({ length: 10 }, (_, s) => assignRoles(canTravel, s).join()));
    expect(runs.size).toBeGreaterThan(5);
  });
});
