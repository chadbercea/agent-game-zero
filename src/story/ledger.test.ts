import { describe, expect, it } from 'vitest';
import { DEMO_1, type Entity, WorkLedger } from './ledger';

const ENTITIES: Entity[] = [
  { id: 'node:figma', kind: 'node', name: 'Figma', system: 'Tools' },
  { id: 'node:github', kind: 'node', name: 'GitHub', system: 'Tools' },
  { id: 'node:jira', kind: 'node', name: 'Jira', system: 'Atlassian' },
  { id: 'agent:d3v1n', kind: 'agent', name: 'D3V1N', system: 'Tools' },
  { id: 'sub:figma', kind: 'sub-agent', name: 'Figma sub-agent', system: 'Tools' },
];

function ledger(seed = 7): WorkLedger {
  const l = new WorkLedger(seed);
  for (const e of ENTITIES) l.register(e);
  return l;
}

describe('WorkLedger', () => {
  it('starts every entity with work already done, under way and waiting', () => {
    const l = ledger();
    for (const { id, kind } of ENTITIES) {
      const t = l.tally(id);
      expect(t.inProgress).toBeGreaterThan(0);
      expect(t.items).toHaveLength(t.inProgress);
      if (kind !== 'sub-agent') expect(t.done).toBeGreaterThan(10);
    }
  });

  it('is the same for the same seed and different for another', () => {
    expect(ledger(7).tally('node:jira')).toEqual(ledger(7).tally('node:jira'));
    expect(ledger(7).totals('node')).not.toEqual(ledger(8).totals('node'));
  });

  it('completing work counts it, and starts the next item from the queue', () => {
    const l = ledger();
    const before = l.tally('node:figma');
    l.complete(['node:figma']);
    const after = l.tally('node:figma');
    expect(after.done).toBe(before.done + 1);
    expect(after.inProgress).toBe(before.inProgress);
    expect(after.queued).toBe(Math.max(0, before.queued - 1));
    expect(after.items[0]).not.toEqual(before.items[0]);
  });

  it('keeps DEMO-1 under way among the other items until it is finished', () => {
    const l = ledger();
    l.assign(DEMO_1, ['node:figma', 'agent:d3v1n']);
    for (let i = 0; i < 50; i++) l.complete(['node:figma', 'agent:d3v1n']);
    expect(l.tally('node:figma').items).toContainEqual(DEMO_1);
    expect(l.tally('node:jira').items).not.toContainEqual(DEMO_1);
    const done = l.tally('agent:d3v1n').done;
    l.finish(DEMO_1.key);
    expect(l.tally('agent:d3v1n').items).not.toContainEqual(DEMO_1);
    expect(l.tally('agent:d3v1n').done).toBe(done + 1);
  });

  it('totals by kind and system, and shares add up to the whole', () => {
    const l = ledger();
    const nodes = l.totals('node');
    expect(l.totals('node', 'Tools').done + l.totals('node', 'Atlassian').done).toBe(nodes.done);
    const shares = l.entities('node').reduce((s, e) => s + l.share(e.id), 0);
    expect(shares).toBeCloseTo(1);
    expect(l.systemShare('Tools') + l.systemShare('Atlassian')).toBeCloseTo(1);
  });

  it('arrivals land in the queue; registering again starts an entity over', () => {
    const l = ledger();
    const queued = l.tally('sub:figma').queued;
    l.arrive(['sub:figma'], 3);
    expect(l.tally('sub:figma').queued).toBe(queued + 3);
    for (let i = 0; i < 20; i++) l.complete(['sub:figma']);
    l.register(ENTITIES[4]);
    expect(l.tally('sub:figma').done).toBeLessThan(20);
  });
});
