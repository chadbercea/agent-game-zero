import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { SceneHost } from '../stage/Stage';
import { rollDevDay } from './devDay';
import { DEV_BEATS, type DevBeat, RovoDev } from './rovoDev';

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
  const run = async (seconds: number, each: () => boolean | void = () => {}) => {
    for (let t = 0; t < seconds; t += DT) {
      for (const fn of [...ticks]) fn(DT);
      if (each()) return;
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
  };
  return { root, stage, run };
}

async function play(seed: number) {
  const { stage, run } = testStage();
  const scene = new RovoDev(stage, seed);
  const beats: DevBeat[] = [];
  let mostCoding = 0;
  let cloudsSeen = 0;
  void scene.start();
  await run(500, () => {
    if (beats[beats.length - 1] !== scene.beat) beats.push(scene.beat);
    mostCoding = Math.max(mostCoding, scene.lanes.filter(Boolean).length);
    cloudsSeen = Math.max(cloudsSeen, scene.clouds.filter((c) => c.visible).length);
    return scene.finished;
  });
  return { scene, beats, mostCoding, cloudsSeen };
}

describe('Rovo Dev', () => {
  // 5: everything (Figma through MCP, two reviews ask for changes, CI red once, a Slack post).
  // 2: the plain day (two chores, no changes asked for, CI green, no Slack).
  // 9: a feature and a chore, both sent back once, CI red once.
  for (const seed of [5, 2, 9]) {
    it(`seed ${seed}: the developer's day, start to finish`, async () => {
      const day = rollDevDay(seed);
      const issues = day.issues.length;
      const { scene, beats, mostCoding, cloudsSeen } = await play(seed);
      expect(scene.finished).toBe(true);
      // The jobs, in order.
      expect(beats).toEqual([...DEV_BEATS]);
      // The clouds brought every issue in, each group its own size, and drifted away.
      expect(scene.clouds).toHaveLength(day.issues.reduce((n, i) => n + i.clouds.length, 0));
      expect(cloudsSeen).toBeGreaterThan(0);
      expect(scene.clouds.every((c) => !c.parent)).toBe(true);
      // Understood: each issue read what it needed and reported to the developer, plus the release notes.
      expect(scene.userReports).toBe(issues + 1);
      expect(scene.mcpReads).toBe(day.issues.filter((i) => i.understand.some((s) => s.mcp)).length);
      expect(scene.systems.placed.has('figma')).toBe(false);
      if (day.issues.some((i) => i.kind === 'bug')) expect(scene.systems.placed.has('codesearch')).toBe(true);
      // Every change coded in its own lane at once, reviewed (again where changes were asked for), merged and shipped.
      expect(mostCoding).toBe(issues);
      const asked = day.issues.filter((i) => i.changes).length;
      expect(scene.changesRequested).toBe(asked);
      expect(scene.reviews).toBe(issues + asked);
      expect(scene.ciRetries).toBe(day.flakyCI ? 1 : 0);
      expect(scene.shipped).toBe(issues);
      // The developer heard about the bug in Slack, and the fix was posted there; the docs stayed current.
      expect(scene.tasks.filter((t) => t.task.type === 'slack' && t.done === 1)).toHaveLength(2);
      expect(day.issues[0].kind).toBe('bug');
      expect(scene.systems.placed.get('confluence')?.writeBacks.length).toBeGreaterThanOrEqual(1);
      // Every task a DEV issue, done; everyone home; Jira quiet.
      expect(scene.tasks.every((t) => /^DEV-\d+$/.test(t.key) && t.done === t.task.steps.length)).toBe(true);
      expect(scene.hub.done).toBe(scene.tasks.length);
      expect(scene.copies.size).toBe(0);
      expect(scene.jira.light).toBe('off');
    });
  }

  it('same seed, same day; different seeds, different days', () => {
    expect(rollDevDay(5)).toEqual(rollDevDay(5));
    const days = new Set(Array.from({ length: 12 }, (_, s) => JSON.stringify(rollDevDay(s + 1))));
    expect(days.size).toBe(12);
  });
});
