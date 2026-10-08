import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { Drone } from '../primitives/drone/Drone';
import type { SceneHost } from '../stage/Stage';
import { StoryV2, type V2Beat } from './storyV2';

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
    // Tertiary nodes went with their agents.
    expect(story.tertiaries.count).toBe(0);
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

  it('puts gates and tools on the grid only as agents call them', async () => {
    let tertiaryCount = 0;
    const onGrid = async (through: V2Beat) => {
      const { stage, run } = testStage();
      const story = new StoryV2(stage);
      let played = false;
      void story.play(through).then(() => (played = true));
      await run(400, () => played);
      expect(played).toBe(true);
      const nodes = Object.values(story.nodes()).filter((n) => n.visible).map((n) => n.kind).sort();
      const gates = [story.scene.act1.gate.visible, story.scene.act2.gate.visible];
      tertiaryCount = story.tertiaries.count;
      return { nodes, gates };
    };
    expect(await onGrid('opening')).toEqual({ nodes: [], gates: [false, false] });
    expect(await onGrid('own-system')).toEqual({ nodes: ['github'], gates: [true, false] });
    expect(await onGrid('rovo-bridge')).toEqual({ nodes: ['github', 'jira'], gates: [true, true] });
    expect(await onGrid('juiced-crew')).toEqual({ nodes: ['bitbucket', 'github', 'jira'], gates: [true, true] });
    // Every working agent builds its own tertiary (ILI-974): one off GitHub, two off Bitbucket.
    expect(tertiaryCount).toBe(3);
    expect((await onGrid('full-system')).nodes).toHaveLength(7);
  });

  it("lists only called tools on each gate's hover card, as they come up, and starts over after a reset", async () => {
    const { stage, run } = testStage();
    const story = new StoryV2(stage);
    const listed = (gate: 0 | 1) => {
      const target = story.hoverTargets()[gate];
      return (target.card().breakdown ?? []).map(([name]) => name).sort();
    };
    let played = false;
    void story.play('own-system').then(() => (played = true));
    await run(400, () => played);
    expect(listed(0)).toEqual(['GitHub']);
    expect(listed(1)).toEqual([]);
    played = false;
    void story.reset().then(() => (played = true));
    await run(60, () => played);
    expect(listed(0)).toEqual([]);
    played = false;
    void story.play('juiced-crew').then(() => (played = true));
    await run(400, () => played);
    expect(listed(0)).toEqual(['GitHub']);
    expect(listed(1)).toEqual(['Bitbucket', 'Jira']);
  });
});
