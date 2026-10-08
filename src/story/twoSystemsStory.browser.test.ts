import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { SceneHost } from '../stage/Stage';
import { ACT1_GATE, D3V1N_KINDS } from './layout';
import { TwoSystemsStory } from './twoSystemsStory';

function testStage(fps = 30) {
  const DT = 1 / fps;
  const root = new Object3D();
  const ticks = new Set<(dt: number) => void>();
  const stage = {
    add: (...objects: Object3D[]) => root.add(...objects),
    onTick: (fn: (dt: number) => void) => {
      ticks.add(fn);
      return () => void ticks.delete(fn);
    },
  } as unknown as SceneHost;
  const run = async (seconds: number, done: () => boolean = () => false, each: () => void = () => {}) => {
    for (let t = 0; t < seconds && !done(); t += DT) {
      for (const fn of [...ticks]) fn(DT);
      each();
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
  };
  return { root, stage, run };
}

describe('Two Systems story, Version A', () => {
  it('is D3V1N’s system from the Two Systems layout, with Linear added, behind its one gate', () => {
    const { stage } = testStage();
    const story = new TwoSystemsStory(stage);
    expect(D3V1N_KINDS).toEqual(['linear', 'notion', 'figma', 'github']);
    expect(story.map.nodes.map((n) => n.kind)).toEqual(['linear', 'notion', 'figma', 'github']);
    expect(story.gate.position.equals(ACT1_GATE)).toBe(true);
    // Nothing is up until it's called.
    expect(story.map.nodes.every((n) => !n.visible)).toBe(true);
  });

  it('plays the eight beats: tools come up as called, products ride back, plan, PR, Linear updated by hand', async () => {
    const { stage, run } = testStage();
    const story = new TwoSystemsStory(stage);
    const gateStates = new Set<string>();
    const stackSizes = new Set<number>();
    let ticketGreenAtEnd = false;
    let played = false;
    void story.play().then(() => (played = true));
    await run(
      90,
      () => played,
      () => {
        gateStates.add(story.gate.state);
        stackSizes.add(story.carried.length);
        if (story.pr.visible && story.ticket.glow > 0.9) ticketGreenAtEnd = true;
      },
    );
    expect(played).toBe(true);
    expect([...gateStates]).toEqual(expect.arrayContaining(['thinking', 'open']));
    expect(gateStates.has('denied')).toBe(false);
    // Called in story order, each once.
    expect(story.called).toEqual(['linear', 'notion', 'figma', 'github']);
    expect(story.map.nodes.every((n) => n.visible)).toBe(true);
    // The stack grew one product at a time to three, then merged into the plan.
    expect([...stackSizes].sort()).toEqual([0, 1, 2, 3]);
    expect(story.plan.visible).toBe(true);
    expect(story.carried).toHaveLength(0);
    // Code: branch, three commits, the PR; the ticket in Linear updated by hand.
    expect(story.branch?.drawn).toBe(1);
    expect(story.commits).toHaveLength(3);
    expect(story.pr.visible).toBe(true);
    expect(ticketGreenAtEnd).toBe(true);
    expect(story.ticketLink.visible && story.prdLink.visible).toBe(true);
  });

  it('resets clean and plays the same again', async () => {
    const { stage, run } = testStage();
    const story = new TwoSystemsStory(stage);
    for (let i = 0; i < 2; i++) {
      let done = false;
      void story.play().then(() => (done = true));
      await run(90, () => done);
      expect(story.called).toHaveLength(4);
      done = false;
      void story.reset().then(() => (done = true));
      await run(10, () => done);
      expect(story.called).toHaveLength(0);
      expect(story.map.nodes.every((n) => !n.visible)).toBe(true);
      expect(story.plan.visible || story.pr.visible || story.ticket.visible).toBe(false);
    }
  });
});
