import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { SYSTEM_KINDS, type SystemKind } from '../primitives/node/emblems';
import type { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { HUMAN_TOOLS, HumanLoop } from './humanLoop';

/** Somewhere on the floor for each tool, apart from each other. */
const SPOT: Record<SystemKind, [number, number]> = {
  jira: [3, -0.5],
  github: [-3, -1.5],
  notion: [-6.5, 0],
  figma: [-1, -5],
  confluence: [3.5, -5],
  bitbucket: [6, -3],
  codesearch: [6.5, 0.5],
  linear: [-6, -4],
};

type Tick = (dt: number, elapsed: number) => void;

function setup(online: SystemKind[], seed = 7) {
  const ticks: Tick[] = [];
  let elapsed = 0;
  const stage = {
    onTick: (fn: Tick) => {
      ticks.push(fn);
      return () => ticks.splice(ticks.indexOf(fn), 1);
    },
    add: () => {},
  } as unknown as SceneHost;
  const nodes = {} as Record<SystemKind, SystemNode>;
  for (const kind of SYSTEM_KINDS) {
    const node = Object.assign(new Object3D(), { kind, dim: online.includes(kind) ? 0 : 1 }) as unknown as SystemNode;
    node.position.set(SPOT[kind][0], 0, SPOT[kind][1]);
    nodes[kind] = node;
  }
  const loop = new HumanLoop(stage, nodes, seed);
  const run = async (seconds: number, step = 0.05) => {
    for (let t = 0; t < seconds; t += step) {
      elapsed += step;
      for (const fn of [...ticks]) fn(step, elapsed);
      await Promise.resolve();
      await Promise.resolve();
    }
  };
  return { loop, run };
}

describe('HumanLoop', () => {
  it('keeps handing issues in, only to online tools people work in, never more than two clouds at once', async () => {
    const { loop, run } = setup(['jira', 'github', 'confluence', 'notion', 'figma', 'bitbucket', 'codesearch']);
    loop.start();
    await run(90);
    expect(loop.delivered).toBeGreaterThan(12);
    expect(loop.log.every((k) => HUMAN_TOOLS.includes(k))).toBe(true);
    expect(new Set(loop.log)).toEqual(new Set(HUMAN_TOOLS));
    expect(loop.peak).toBeLessThanOrEqual(2);
  });

  it('only Jira while the other tools are still ghosts', async () => {
    const { loop, run } = setup(['jira', 'github']);
    loop.start();
    await run(40);
    expect(loop.delivered).toBeGreaterThan(3);
    expect(new Set(loop.log)).toEqual(new Set(['jira']));
  });

  it('is the same for the same seed, different for another, and stops when told', async () => {
    const all: SystemKind[] = [...SYSTEM_KINDS];
    const a = setup(all, 3);
    const b = setup(all, 3);
    const c = setup(all, 4);
    for (const s of [a, b, c]) s.loop.start();
    await Promise.all([a.run(60), b.run(60), c.run(60)]);
    expect(a.loop.log).toEqual(b.loop.log);
    expect(a.loop.log).not.toEqual(c.loop.log);
    a.loop.stop();
    const n = a.loop.delivered;
    await a.run(30);
    expect(a.loop.delivered).toBeLessThanOrEqual(n + 2); // clouds already out finish; no new ones
  });
});
