import { describe, expect, it } from 'vitest';
import type { Vector3 } from 'three';
import { distanceToPolyline } from '../primitives/branch/gridPath';
import { type StoryMap, storyMap } from './storyMap';

const ALL = ['confluence', 'figma', 'gdocs', 'notion'] as const;
const key = (m: StoryMap) =>
  [m.gate, m.userTerminal, m.slack.at, m.code.scm, m.code.portal, ...Object.values(m.places)]
    .map((p) => `${(p as Vector3).x},${(p as Vector3).z}`)
    .join(' ');
/** The arrangement alone: gate corner, code side's turn and mirror, Slack's side, the terminal. */
const arrangement = (m: StoryMap) =>
  [m.gate, m.code.flow, m.code.across, m.slack.out, m.userTerminal].map((p) => `${p.x},${p.z}`).join(' ');
const onGrid = (p: Vector3) => Math.abs(p.x * 2 - Math.round(p.x * 2)) < 1e-9 && Math.abs(p.z * 2 - Math.round(p.z * 2)) < 1e-9;
const square = (line: Vector3[]) => line.slice(1).every((b, i) => Math.abs(b.x - line[i].x) < 1e-9 || Math.abs(b.z - line[i].z) < 1e-9);

describe('storyMap (ILI-1011): the seed drives the whole map', () => {
  it('same seed, same map; and seeds give clearly different maps', () => {
    expect(key(storyMap(5, { mini: ALL }))).toBe(key(storyMap(5, { mini: ALL })));
    const maps = Array.from({ length: 20 }, (_, i) => storyMap(i + 1, { mini: ALL }));
    expect(new Set(maps.map(key)).size).toBe(20);
    // Not just the mini systems: the arrangement itself moves (gate, code side, Slack, terminal).
    expect(new Set(maps.map(arrangement)).size).toBeGreaterThanOrEqual(15);
    // The code side grows out on every side over a run of seeds.
    expect(new Set(maps.map((m) => `${m.code.flow.x},${m.code.flow.z}`)).size).toBe(4);
  });

  it('the house rules hold for every seed: on the grid, square lines, groups apart, mini systems clear', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const m = storyMap(seed, { mini: ALL });
      const code = [m.code.scm, m.code.codesearch, m.code.assembler, m.code.portal, ...m.code.lanes.flatMap((l) => [l.spot, l.terminal])];
      // Nodes and lane parts stand on the grid (the portal sits at the end of its belt, wherever that is).
      for (const p of [m.gate, m.jira, m.userTerminal, m.slack.at, ...code.filter((p) => p !== m.code.portal), ...(Object.values(m.places) as Vector3[])])
        expect(onGrid(p)).toBe(true);
      for (const l of m.code.lanes) expect(square([l.spot, ...l.intoRepo])).toBe(true);
      expect(m.slack.run.from).toBeLessThan(m.slack.run.to);
      for (const p of code) {
        for (const q of [m.jira, m.gate, m.slack.at, m.userTerminal]) expect(p.distanceTo(q)).toBeGreaterThanOrEqual(2.5 - 1e-9);
        expect(distanceToPolyline(p.x, p.z, [m.jira, m.slack.at])).toBeGreaterThanOrEqual(1.5 - 1e-9);
      }
      for (const kind of ALL) {
        const p = m.places[kind] as Vector3;
        for (const q of code) expect(p.distanceTo(q)).toBeGreaterThanOrEqual(2 - 1e-9);
      }
      expect(m.viewSize).toBeGreaterThan(8);
    }
  });

  it('a story lays out only the systems it uses', () => {
    const m = storyMap(8, { mini: ['confluence', 'figma'] });
    expect(m.places.confluence).toBeDefined();
    expect(m.places.figma).toBeDefined();
    expect(m.places.gdocs).toBeUndefined();
    expect(m.places.notion).toBeUndefined();
    expect(m.mcpAt).toBeDefined();
  });

  it('production (Rovo on Call): past the portal, on the grid, clear of the rest, turning with the code side', () => {
    const ON_CALL = ['confluence', 'jsm', 'compass', 'statuspage'] as const;
    const flows = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const m = storyMap(seed, { mini: ON_CALL, production: true });
      const prod = m.production!;
      flows.add(`${prod.flow.x},${prod.flow.z}`);
      const slots = prod.tiers.flat();
      expect(prod.tiers.map((t) => t.length)).toEqual([1, 3, 3]);
      for (const p of slots) {
        expect(onGrid(p)).toBe(true);
        // Downstream of the portal.
        expect(p.clone().sub(m.code.portal).dot(prod.flow)).toBeGreaterThan(2);
        for (const q of [m.jira, m.gate, m.slack.at, m.userTerminal, ...(Object.values(m.places) as Vector3[])]) expect(p.distanceTo(q)).toBeGreaterThanOrEqual(2.5 - 1e-9);
      }
      // Halfway between slots is on the grid too (where replicas and terminals stand).
      expect(onGrid(slots[0].clone().addScaledVector(prod.across, Math.floor(prod.slotGap / 2 / 0.5) * 0.5))).toBe(true);
      // The monitoring tool stands beside JSM, in line with it along the grid.
      const jsm = m.places.jsm as Vector3;
      expect(m.monitorAt).toBeDefined();
      expect(square([jsm, m.monitorAt!])).toBe(true);
      expect(m.monitorAt!.distanceTo(jsm)).toBeCloseTo(2.5);
    }
    expect(flows.size).toBe(4);
  });
});
