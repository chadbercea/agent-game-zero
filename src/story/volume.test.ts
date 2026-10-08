import { describe, expect, it } from 'vitest';
import type { Drone } from '../primitives/drone/Drone';
import type { SystemKind } from '../primitives/node/emblems';
import type { TwoActScene } from './twoActs';
import { D3V1N_ID, nodeId, subId, Volume, type Worker } from './volume';

type Tick = (dt: number, elapsed: number) => void;

function setup(seed = 3) {
  const ticks: Tick[] = [];
  const stage = { onTick: (fn: Tick) => (ticks.push(fn), () => {}) };
  const map = (kinds: SystemKind[]) => ({ map: { nodes: kinds.map((kind) => ({ kind })) } });
  const scene = {
    act1: map(['figma', 'github', 'notion']),
    act2: map(['codesearch', 'confluence', 'jira', 'bitbucket']),
  } as unknown as Pick<TwoActScene, 'act1' | 'act2'>;
  const d3v1n = { status: 'waiting' } as Drone;
  const figmaSub = { status: 'working' } as Drone;
  let workers: Worker[] = [{ id: D3V1N_ID, drone: d3v1n }];
  const volume = new Volume(stage, scene, () => workers, seed);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.1) for (const fn of ticks) fn(0.1, t);
  };
  const sendFigmaSub = () =>
    (workers = [...workers, { id: subId('figma'), drone: figmaSub, parentId: D3V1N_ID, nodeId: nodeId('figma') }]);
  return { volume, run, d3v1n, figmaSub, sendFigmaSub };
}

describe('Volume', () => {
  it('keeps every node busy in the background, so the grid total climbs on its own', () => {
    const { volume, run } = setup();
    const before = volume.ledger.totals('node').done;
    run(30);
    expect(volume.ledger.totals('node').done).toBeGreaterThan(before + 30);
  });

  it('credits a working sub-agent, its node and its parent; a waiting one earns nothing', () => {
    const { volume, run, figmaSub, sendFigmaSub } = setup();
    sendFigmaSub();
    run(0.1);
    const sub = volume.ledger.tally(subId('figma')).done;
    const parent = volume.ledger.tally(D3V1N_ID).done;
    run(20);
    expect(volume.ledger.tally(subId('figma')).done).toBeGreaterThanOrEqual(sub + 5);
    expect(volume.ledger.tally(D3V1N_ID).done).toBeGreaterThanOrEqual(parent + 5);
    figmaSub.status = 'waiting';
    const idle = volume.ledger.tally(subId('figma')).done;
    run(20);
    expect(volume.ledger.tally(subId('figma')).done).toBe(idle);
  });

  it('puts DEMO-1 under way at the agent, the tools it touches and their sub-agents', () => {
    const { volume, run, sendFigmaSub } = setup();
    sendFigmaSub();
    run(0.1);
    for (const id of [D3V1N_ID, nodeId('figma'), nodeId('jira'), subId('figma')]) {
      expect(volume.ledger.tally(id).items.map((i) => i.key)).toContain('DEMO-1');
    }
    expect(volume.ledger.tally(nodeId('bitbucket')).items.map((i) => i.key)).not.toContain('DEMO-1');
  });

  it('keeps queues from running dry and repeats for the same seed', () => {
    const a = setup(5);
    const b = setup(5);
    a.run(120);
    b.run(120);
    expect(a.volume.ledger.totals('node')).toEqual(b.volume.ledger.totals('node'));
    expect(a.volume.ledger.totals('node').queued).toBeGreaterThan(20);
  });

  it('reports every new request landing at a node, the same requests the ledger queues', () => {
    const { volume, run } = setup();
    const landed = new Map<string, number>();
    volume.onArrive((id) => landed.set(id, (landed.get(id) ?? 0) + 1));
    const before = volume.ledger.tally(nodeId('jira'));
    run(60);
    const after = volume.ledger.tally(nodeId('jira'));
    const n = landed.get(nodeId('jira')) ?? 0;
    expect(n).toBeGreaterThan(5);
    // Each finished piece pulls one off the queue; each arrival adds one.
    expect(after.queued).toBe(before.queued - (after.done - before.done) + n);
    expect([...landed.keys()].every((id) => id.startsWith('node:'))).toBe(true);
  });
});

describe('Volume with only some tools on the grid', () => {
  it('keeps only tools on the grid on the books: totals grow as tools come up and start over when they go', () => {
    const ticks: Tick[] = [];
    const stage = { onTick: (fn: Tick) => (ticks.push(fn), () => {}) };
    const map = (kinds: SystemKind[]) => ({ map: { nodes: kinds.map((kind) => ({ kind })) } });
    const scene = {
      act1: map(['figma', 'github', 'notion']),
      act2: map(['codesearch', 'confluence', 'jira', 'bitbucket']),
    } as unknown as Pick<TwoActScene, 'act1' | 'act2'>;
    const onGrid = new Set<SystemKind>();
    const volume = new Volume(stage, scene, () => [], 3, (kind) => onGrid.has(kind));
    const run = (seconds: number) => {
      for (let t = 0; t < seconds; t += 0.1) for (const fn of ticks) fn(0.1, t);
    };
    const nodesOnBooks = () => volume.ledger.entities('node').map((e) => e.id).sort();
    run(5);
    expect(nodesOnBooks()).toEqual([]);
    expect(volume.ledger.totals('node').done).toBe(0);

    onGrid.add('github');
    run(0.1);
    expect(nodesOnBooks()).toEqual([nodeId('github')]);
    // DEMO-1 is under way at GitHub, one of the tools it touches.
    expect(volume.ledger.tally(nodeId('github')).items.some((i) => i.key === 'DEMO-1')).toBe(true);
    const github = volume.ledger.totals('node').done;
    expect(github).toBe(volume.ledger.tally(nodeId('github')).done);
    run(30);
    // Background work only where the grid is: the grid total is GitHub's alone, still climbing.
    expect(volume.ledger.totals('node').done).toBe(volume.ledger.tally(nodeId('github')).done);
    expect(volume.ledger.totals('node').done).toBeGreaterThan(github);
    expect(volume.ledger.share(nodeId('github'))).toBe(1);

    onGrid.add('jira');
    run(0.1);
    expect(nodesOnBooks()).toEqual([nodeId('github'), nodeId('jira')]);

    onGrid.clear();
    run(0.1);
    expect(nodesOnBooks()).toEqual([]);
    expect(volume.ledger.totals('node').done).toBe(0);
  });
});
