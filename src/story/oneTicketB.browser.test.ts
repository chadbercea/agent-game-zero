import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { Gate } from '../primitives/gate/Gate';
import type { SceneHost } from '../stage/Stage';
import { B_CENTER, B_KINDS, B_LAYOUT, OneTicketB } from './oneTicketB';

/** A stage with no renderer: a scene root and a clock the test drives a frame at a time. */
function testStage(fps = 30) {
  const DT = 1 / fps;
  const root = new Object3D();
  const ticks = new Set<(dt: number) => void>();
  let clock = 0;
  const stage = {
    add: (...objects: Object3D[]) => root.add(...objects),
    onTick: (fn: (dt: number) => void) => {
      ticks.add(fn);
      return () => void ticks.delete(fn);
    },
  } as unknown as SceneHost;
  const run = async (seconds: number, done: () => boolean = () => false, each: (t: number) => void = () => {}) => {
    for (let t = 0; t < seconds && !done(); t += DT) {
      for (const fn of [...ticks]) fn(DT);
      clock += DT;
      each(clock);
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
  };
  return { root, stage, run, now: () => clock };
}

describe('OneTicketB, Version B beats 1–3', () => {
  it('lays out home, one gateway, and the Atlassian side already joined by Graph Lines, Rovo waiting', () => {
    const { root, stage } = testStage();
    const story = new OneTicketB(stage);
    expect([...story.nodes.keys()]).toEqual(['jira', 'confluence', 'figma', 'codesearch', 'bitbucket']);
    expect(B_KINDS).toHaveLength(5);
    // Home on the left of the gateway on screen, the Atlassian side to its right.
    const screenX = (p: { x: number; z: number }) => p.x - p.z;
    const [near, far] = story.gateway.ends;
    expect(screenX(B_LAYOUT.home)).toBeLessThan(screenX(near));
    for (const node of story.nodes.values()) expect(screenX(node.position)).toBeGreaterThan(screenX(far));
    // Every Graph Line is drawn from the start; the gateway is built, locked and flowing.
    expect(story.lines.every((l) => l.edge.drawn === 1)).toBe(true);
    expect(story.gateway.built).toBe(1);
    expect(story.gateway.lockDrop).toBe(1);
    // No gates in Version B: the gateway is the only crossing.
    const gates: Gate[] = [];
    root.traverse((o) => o instanceof Gate && gates.push(o));
    expect(gates).toHaveLength(0);
    expect(story.rovo.drone.name).toBe('Rovo');
    // Home, the first thing placed, is at the origin, dead center of the fixed camera (ILI-977).
    expect(B_LAYOUT.home.length()).toBe(0);
    expect(B_CENTER.equals(B_LAYOUT.home)).toBe(true);
  });

  it('lands DEMO-990, crosses the gateway, asks Rovo once, and gets five back in one delivery', async () => {
    const { stage, run } = testStage();
    const story = new OneTicketB(stage);
    let stackSizes = new Set<number>();
    let played = false;
    void story.play('b3').then(() => (played = true));
    await run(30, () => played, () => stackSizes.add(story.carried.length));
    expect(played).toBe(true);
    expect(story.ticket.visible).toBe(true);
    expect(story.ticket.request.key).toBe('DEMO-990');
    // Rovo walked the connected lines: Jira first, then on to Confluence, Figma and Code search.
    expect(story.walked[0]).toBe('jira');
    expect([...story.walked].sort()).toEqual(['codesearch', 'confluence', 'figma', 'jira']);
    expect(story.walked.indexOf('confluence')).toBeLessThan(story.walked.indexOf('figma'));
    // All five at once: the stack went straight from empty to five.
    stackSizes = new Set([...stackSizes].sort());
    expect([...stackSizes]).toEqual([0, 5]);
    expect(story.carried.map((p) => p.kind)).toEqual(['jira', 'confluence', 'figma', 'jira', 'codesearch']);
    // Through the gateway and back: in once each way, and home.
    expect(story.crossings).toBe(2);
    expect(story.drone.position.distanceTo(B_LAYOUT.home)).toBeLessThan(1e-3);
  });

  it('plays Version B end to end in about 15 s: one gateway, a linked record at DEMO-990, no trip back', async () => {
    const { stage, run, now } = testStage();
    const story = new OneTicketB(stage);
    let played = false;
    let leftHomeAfterPlan = false;
    void story.play('b6').then(() => (played = true));
    await run(
      40,
      () => played,
      () => {
        if (story.plan.visible && story.drone.position.distanceTo(B_LAYOUT.home) > 1e-3) leftHomeAfterPlan = true;
      },
    );
    expect(played).toBe(true);
    expect(now()).toBeGreaterThan(12);
    expect(now()).toBeLessThan(18);
    // The plan, from five.
    expect(story.plan.visible).toBe(true);
    expect(story.carried).toHaveLength(0);
    // Code through the gateway: the branch off Bitbucket, three commits on it, the PR carrying DEMO-990.
    expect(story.branch.drawn).toBe(1);
    expect(story.commits).toHaveLength(3);
    expect(story.pr.visible).toBe(true);
    expect(story.pr.request.title).toContain('DEMO-990');
    // Jira recorded it on its own: the line from the PR is in, the issue shows the record, D3V1N never went back.
    expect(story.recordLine.drawn).toBe(1);
    expect(story.record.visible).toBe(true);
    expect(leftHomeAfterPlan).toBe(false);
    // One gateway, crossed there and back once.
    expect(story.crossings).toBe(2);
  });

  it('plays B4–6 on its own, starting from D3V1N home with all five', async () => {
    const { stage, run } = testStage();
    const story = new OneTicketB(stage);
    let played = false;
    void story.play('b6', 'b4').then(() => (played = true));
    expect(story.carried).toHaveLength(5);
    expect(story.ticket.visible).toBe(true);
    await run(20, () => played);
    expect(played).toBe(true);
    expect(story.record.visible).toBe(true);
  });

  it('resets clean and plays the same again', async () => {
    const { stage, run } = testStage();
    const story = new OneTicketB(stage);
    for (let i = 0; i < 2; i++) {
      let done = false;
      void story.play('b6').then(() => (done = true));
      await run(40, () => done);
      expect(story.record.visible).toBe(true);
      done = false;
      void story.reset().then(() => (done = true));
      await run(10, () => done);
      expect(story.carried).toHaveLength(0);
      expect(story.ticket.visible).toBe(false);
      expect(story.walked).toHaveLength(0);
      expect(story.plan.visible || story.pr.visible || story.record.visible).toBe(false);
      expect(story.commits).toHaveLength(0);
      expect(story.branch.drawn + story.recordLine.drawn).toBe(0);
      expect([...story.nodes.values()].every((n) => n.light === 'off')).toBe(true);
    }
  });
});
