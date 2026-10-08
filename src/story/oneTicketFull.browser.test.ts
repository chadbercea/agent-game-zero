import { Object3D, type Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { SceneHost } from '../stage/Stage';
import { A_CENTER } from './oneTicket';
import { B_CENTER } from './oneTicketB';
import { type FullPhase, OneTicketFull } from './oneTicketFull';

/** A stage with no renderer: a scene root and a clock the test drives a frame at a time. */
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

describe('OneTicketFull: A, then B', () => {
  it('plays A, clears to the empty grid, then plays B; only one version ever on screen', async () => {
    const { stage, run } = testStage();
    const frames: Vector3[] = [];
    const story = new OneTicketFull(stage, (c) => frames.push(c.clone()));
    const phases: FullPhase[] = [];
    let played = false;
    void story.play().then(() => (played = true));
    await run(
      90,
      () => played,
      () => {
        if (phases[phases.length - 1] !== story.phase) phases.push(story.phase);
        expect(story.groupA.visible && story.groupB.visible).toBe(false);
      },
    );
    expect(played).toBe(true);
    if (phases[phases.length - 1] !== story.phase) phases.push(story.phase);
    expect(phases).toEqual(['a', 'clear', 'b', 'clear']);
    // The camera cuts to each version's layout once, and never moves otherwise.
    expect(frames).toEqual([A_CENTER, B_CENTER]);
    // Both versions are back to empty for the next loop.
    expect(story.a.carried.length + story.b.carried.length).toBe(0);
    expect(story.a.ticket.visible || story.b.ticket.visible).toBe(false);
  });
});
