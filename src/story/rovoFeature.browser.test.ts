import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { SceneHost } from '../stage/Stage';
import { FEATURE_CODERS, FEATURE_PARTS, FEATURE_RELEASES, type FeatureBeat, RovoFeature } from './rovoFeature';

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

describe('Rovo ships a feature', () => {
  it('one request, start to finish: ask, spec, build, ship, announce, notes, home', async () => {
    const { stage, run } = testStage();
    const scene = new RovoFeature(stage, 4);
    const beats: FeatureBeat[] = [];
    let mostCopies = 0;
    let mostCoding = 0;
    void scene.start();
    await run(400, () => {
      if (beats[beats.length - 1] !== scene.beat) beats.push(scene.beat);
      mostCopies = Math.max(mostCopies, scene.copies.size);
      mostCoding = Math.max(mostCoding, scene.lanes.filter(Boolean).length);
      return scene.finished;
    });
    expect(scene.finished).toBe(true);
    // The plot, in order.
    expect(beats).toEqual(['arriving', 'asked', 'spec', 'build', 'ship', 'wrap-up', 'done']);
    // The spec read the design through MCP, and Figma (third-party) went again after.
    expect(scene.mcpReads).toBe(1);
    expect(scene.systems.placed.has('figma')).toBe(false);
    // Every code ticket merged (the trunk keeps a commit each), three coders at once, and two releases shipped.
    expect(scene.tasks.filter((t) => t.task.type === 'code')).toHaveLength(FEATURE_PARTS.length);
    expect(mostCoding).toBe(FEATURE_CODERS);
    expect(scene.shipped).toBe(FEATURE_RELEASES);
    // The news went out through Slack; the spec and the notes stayed in Confluence; the user heard twice.
    expect(scene.slack.messages).toBeGreaterThan(0);
    expect(scene.systems.placed.get('confluence')?.writeBacks.length).toBeGreaterThanOrEqual(2);
    expect(scene.userReports).toBe(2);
    // Every task is a Jira issue of its own, done; the copies all went home; Jira went quiet.
    expect(scene.tasks.every((t) => /^FEAT-\d+$/.test(t.key) && t.done === t.task.steps.length)).toBe(true);
    expect(scene.hub.done).toBe(scene.tasks.length);
    // The spec writer stays on, waiting, while the coders work: copies don't go home until the work stops.
    expect(mostCopies).toBe(1 + FEATURE_CODERS);
    expect(scene.copies.size).toBe(0);
    expect(scene.jira.light).toBe('off');
  });
});
