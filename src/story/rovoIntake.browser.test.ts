import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { Cloud } from '../primitives/cloud/Cloud';
import { Drone } from '../primitives/drone/Drone';
import type { SceneHost } from '../stage/Stage';
import { PERIMETER, ROVO_AT, RovoIntake } from './rovoIntake';

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
  const run = async (seconds: number, each: () => void = () => {}) => {
    for (let t = 0; t < seconds; t += DT) {
      for (const fn of [...ticks]) fn(DT);
      each();
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
  };
  return { root, stage, run };
}

describe('RovoIntake', () => {
  it('starts as a white space with only Rovo (and its triage pads) on it', () => {
    const { root, stage } = testStage();
    const intake = new RovoIntake(stage);
    const drones = root.children.filter((o): o is Drone => o instanceof Drone);
    expect(drones.map((d) => d.name)).toEqual(['Rovo']);
    expect(intake.rovo.drone.position.distanceTo(ROVO_AT)).toBe(0);
    expect(root.children.some((o) => o instanceof Cloud)).toBe(false);
  });

  it('drops cards outside the perimeter, and 1–3 sub-agents get every one and triage it', async () => {
    const { root, stage, run } = testStage();
    const intake = new RovoIntake(stage, 7);
    intake.start();
    let subsSeen = 0;
    let maxBacklog = 0;
    await run(90, () => {
      const subs = root.children.filter((o) => o instanceof Drone && o.subAgent && o.visible).length;
      subsSeen = Math.max(subsSeen, subs);
      maxBacklog = Math.max(maxBacklog, intake.backlog);
    });
    expect(intake.drops.length).toBeGreaterThan(10);
    // The crew keeps up: the floor never piles up.
    expect(maxBacklog).toBeLessThanOrEqual(3);
    for (const at of intake.drops) expect(at.distanceTo(ROVO_AT)).toBeGreaterThan(PERIMETER);
    expect(intake.crew).toBeGreaterThanOrEqual(1);
    expect(intake.crew).toBeLessThanOrEqual(3);
    expect(intake.peakOut).toBeLessThanOrEqual(intake.crew);
    expect(subsSeen).toBeGreaterThanOrEqual(1);
    expect(subsSeen).toBeLessThanOrEqual(3);
    // Nearly everything dropped has been fetched and triaged (a few may still be on their way).
    expect(intake.triaged).toBeGreaterThan(intake.drops.length - 4);
    // Triage spreads across the piles.
    expect(intake.piles.filter((p) => p.length > 0).length).toBeGreaterThan(1);
  });

  it('plays the same run for the same seed, and varies the crew size across seeds', async () => {
    const runOnce = async (seed: number) => {
      const { stage, run } = testStage();
      const intake = new RovoIntake(stage, seed);
      intake.start();
      await run(25);
      return { drops: intake.drops.map((v) => `${v.x.toFixed(3)},${v.z.toFixed(3)}`), crew: intake.crew };
    };
    expect(await runOnce(11)).toEqual(await runOnce(11));
    const crews = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) crews.add(new RovoIntake(testStage().stage, seed).crew);
    expect(crews.size).toBeGreaterThan(1);
  });
});
