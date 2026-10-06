import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { hashSeed, inDroneColumn, pinwheelFree, radialMap, screenStacked } from '../core/scatter';
import { distanceToPolyline } from '../primitives/branch/gridPath';
import { ATLASSIAN_KINDS, JOB_KINDS, type SystemKind } from '../primitives/node/emblems';
import { ACT1_GATE, ATLASSIAN_GATE, HOME } from './layout';
import { layoutSystems, TEAMWORK_LINKS } from './systemLayout';

const plans = [
  { gate: ACT1_GATE, kinds: JOB_KINDS, avoid: [ATLASSIAN_GATE, HOME] },
  { gate: ATLASSIAN_GATE, kinds: ATLASSIAN_KINDS, avoid: [ACT1_GATE, HOME] },
];
const seeds = [1, 2, 3, 7, 42, 99, 1234, 2026, hashSeed('teamwork-graph')];

const positions = (maps: { spots: Vector3[] }[]) => {
  const at = new Map<SystemKind, Vector3>();
  plans.forEach((plan, g) => plan.kinds.forEach((kind, i) => at.set(kind, maps[g].spots[i])));
  return at;
};
const manhattan = (a: Vector3, b: Vector3) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

describe('TEAMWORK_LINKS', () => {
  it('connects every system on the grid into one graph', () => {
    const kinds = [...JOB_KINDS, ...ATLASSIAN_KINDS];
    const reached = new Set<SystemKind>(['jira']);
    for (let grew = true; grew;) {
      grew = false;
      for (const { a, b } of TEAMWORK_LINKS) {
        if (reached.has(a) !== reached.has(b)) {
          reached.add(a).add(b);
          grew = true;
        }
      }
    }
    expect([...reached].sort()).toEqual([...kinds].sort());
  });

  it('joins every third-party tool to Atlassian through a connector', () => {
    for (const kind of JOB_KINDS) {
      expect(TEAMWORK_LINKS.some((l) => l.connector && (l.a === kind || l.b === kind))).toBe(true);
    }
  });
});

describe('layoutSystems', () => {
  for (const seed of seeds) {
    it(`lays out both systems with every graph link clear of other pads (seed ${seed})`, () => {
      const layout = layoutSystems(plans, TEAMWORK_LINKS, seed);
      const at = positions(layout.maps);
      const pads = [...at.values(), ACT1_GATE, ATLASSIAN_GATE];
      expect(layout.lines.size).toBe(TEAMWORK_LINKS.length);
      for (const link of TEAMWORK_LINKS) {
        const { a, b } = link;
        const line = layout.lines.get(link)!;
        // Shortest grid line between the two: |Δx| + |Δz| long.
        const length = line.slice(1).reduce((sum, p, k) => sum + p.distanceTo(line[k]), 0);
        expect(length).toBeCloseTo(manhattan(at.get(a)!, at.get(b)!));
        for (const pad of pads) {
          if (pad === at.get(a) || pad === at.get(b)) continue;
          expect(distanceToPolyline(pad.x, pad.z, line)).toBeGreaterThanOrEqual(0.9);
        }
      }
      // No pinwheel around any node or gate, counting every line that touches it.
      const all = [...layout.maps.flatMap((m) => m.routes), ...layout.lines.values()];
      for (const point of pads) {
        const arms = all.filter((l) => l[0].distanceTo(point) < 1e-6 || l[l.length - 1].distanceTo(point) < 1e-6);
        expect(pinwheelFree(point, arms)).toBe(true);
      }
    });
  }

  it('is deterministic per seed', () => {
    expect(layoutSystems(plans, TEAMWORK_LINKS, 5)).toEqual(layoutSystems(plans, TEAMWORK_LINKS, 5));
  });

  it('aiming at partners makes the linked systems sit closer than free placement', () => {
    let aimed = 0;
    let free = 0;
    for (const seed of seeds) {
      const a = positions(layoutSystems(plans, TEAMWORK_LINKS, seed).maps);
      const f = positions(plans.map((plan) => radialMap(plan.gate, plan.kinds.length, { seed, avoid: plan.avoid })));
      for (const { a: x, b: y } of TEAMWORK_LINKS) {
        aimed += manhattan(a.get(x)!, a.get(y)!);
        free += manhattan(f.get(x)!, f.get(y)!);
      }
    }
    expect(aimed).toBeLessThan(free);
  });

  it('places the most-linked system, Jira, first: in the first ring around its gate', () => {
    for (const seed of seeds) {
      const at = positions(layoutSystems(plans, TEAMWORK_LINKS, seed).maps);
      // First ring: the nearest distance (2.5) plus one reach (1.5), plus half a grid step of snapping.
      expect(at.get('jira')!.distanceTo(ATLASSIAN_GATE)).toBeLessThanOrEqual(2.5 + 1.5 + 0.36);
    }
  });
});

describe('layoutSystems on screen', () => {
  it('never stacks one node in the column above another, or above a gate', () => {
    for (const seed of seeds) {
      const at = [...positions(layoutSystems(plans, TEAMWORK_LINKS, seed).maps).values()];
      at.forEach((p, i) => at.forEach((q, j) => i < j && expect(screenStacked(p, q)).toBe(false)));
      for (const p of at)
        for (const g of [ACT1_GATE, ATLASSIAN_GATE]) expect(inDroneColumn(p.x - g.x, p.z - g.z)).toBe(false);
    }
  });
});
