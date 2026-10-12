import { describe, expect, it } from 'vitest';
import { FINDS, type Mitigation, rollIncident } from './incident';

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe('rollIncident: the seed decides the incident', () => {
  it('same seed, same incident; different seeds, different incidents', () => {
    expect(rollIncident(9)).toEqual(rollIncident(9));
    const keys = new Set(SEEDS.slice(0, 40).map((s) => JSON.stringify(rollIncident(s))));
    expect(keys.size).toBe(40);
  });

  it('production: a web front, 2–3 APIs, 2–3 data stores; every API and store is called', () => {
    for (const seed of SEEDS) {
      const { services } = rollIncident(seed);
      expect(services.length).toBeGreaterThanOrEqual(5);
      expect(services.length).toBeLessThanOrEqual(7);
      expect(services[0].kind).toBe('web');
      expect(new Set(services.map((s) => s.name)).size).toBe(services.length);
      services.forEach((s, i) => {
        if (i === 0) return;
        expect(services.some((caller) => caller.calls.includes(i) && caller.tier === s.tier - 1)).toBe(true);
      });
      // Each tier's services stand in their own slots.
      for (const tier of [1, 2]) {
        const slots = services.filter((s) => s.tier === tier).map((s) => s.slot);
        expect(new Set(slots).size).toBe(slots.length);
      }
    }
  });

  it('the dice hold together: the fix fits the cause, the crew fits the severity, the finding lead is on the crew', () => {
    const fixes = new Set<Mitigation>();
    for (const seed of SEEDS) {
      const inc = rollIncident(seed);
      fixes.add(inc.mitigation);
      expect(inc.leads).toHaveLength(4 - inc.sev);
      expect(inc.leads).toContain(FINDS[inc.cause]);
      expect(inc.find).toBe(FINDS[inc.cause]);
      const culprit = inc.services[inc.culprit];
      if (inc.cause === 'dependency') expect(culprit.tier).toBe(2);
      if (inc.cause === 'config') expect(culprit.kind).toBe('api');
      if (inc.cause === 'deploy') expect(['rollback', 'hotfix']).toContain(inc.mitigation);
      if (inc.mitigation === 'scale-out') expect(inc.replicas).toBeGreaterThanOrEqual(1);
      if (inc.flakyCI) expect(inc.mitigation).toBe('hotfix');
      expect(inc.followUps).toBeGreaterThanOrEqual(1);
      expect(inc.followUps).toBeLessThanOrEqual(Math.min(4, 5 - inc.sev));
      // Blast radius: exactly the services that call the culprit, directly or not.
      const upstream = new Set<number>();
      const reach = (i: number) =>
        inc.services.forEach((s, j) => {
          if (s.calls.includes(i) && !upstream.has(j)) {
            upstream.add(j);
            reach(j);
          }
        });
      reach(inc.culprit);
      expect(new Set(inc.degraded)).toEqual(upstream);
    }
    expect(fixes).toEqual(new Set(['rollback', 'hotfix', 'failover', 'scale-out', 'flag-off']));
  });
});
