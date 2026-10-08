import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { Drone } from '../primitives/drone/Drone';
import type { SceneHost } from '../stage/Stage';
import { StoryV2 } from './storyV2';

/** A stage with no renderer: a scene root and a clock the test drives a frame at a time (`fps` frames a second). */
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
  /** Advance the clock until `done()` or `seconds` pass, letting the story's promises settle every frame. */
  const run = async (seconds: number, done: () => boolean = () => false) => {
    for (let t = 0; t < seconds && !done(); t += DT) {
      for (const fn of [...ticks]) fn(DT);
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
  };
  return { root, stage, run };
}

/** Play the whole story, let the full system run a while, reset: the run's sequence of comings and goings. */
async function playOnce(story: StoryV2, run: ReturnType<typeof testStage>['run']) {
  let played = false;
  void story.play('full-system').then(() => (played = true));
  await run(400, () => played);
  expect(played).toBe(true);
  await run(15);
  let reset = false;
  void story.reset().then(() => (reset = true));
  await run(30, () => reset);
  expect(reset).toBe(true);
  return story.roster.log.map((e) => `${e.event} ${e.name} @${e.at}`);
}

describe('StoryV2 drone sequence', () => {
  it('spawns and despawns every drone in the same order, at the same times, every run', async () => {
    const { root, stage, run } = testStage();
    const story = new StoryV2(stage);
    const first = await playOnce(story, run);
    const second = await playOnce(story, run);
    expect(second).toEqual(first);

    // Everyone who came, went: one despawn per spawn, nobody left on stage but D3V1N (faded out).
    const spawns = first.filter((e) => e.startsWith('spawn')).length;
    expect(first.filter((e) => e.startsWith('despawn')).length).toBe(spawns);
    expect(story.roster.names).toEqual([]);
    const drones = root.children.filter((o): o is Drone => o instanceof Drone);
    expect(drones).toEqual([story.drone]);
    expect(story.drone.fade).toBe(0);
  });

  it('plays the same run for the same seed, on a fresh stage', async () => {
    const a = testStage();
    const b = testStage();
    const [one, two] = await Promise.all([
      playOnce(new StoryV2(a.stage, 9), a.run),
      playOnce(new StoryV2(b.stage, 9), b.run),
    ]);
    expect(two).toEqual(one);
  });

  it('keeps the same order at a different frame rate', async () => {
    const a = testStage(30);
    const b = testStage(60);
    const [one, two] = await Promise.all([playOnce(new StoryV2(a.stage), a.run), playOnce(new StoryV2(b.stage), b.run)]);
    const order = (log: string[]) => log.map((e) => e.split(' @')[0]);
    expect(order(two)).toEqual(order(one));
  });
});
