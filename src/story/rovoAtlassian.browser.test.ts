import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Drone } from '../primitives/drone/Drone';
import type { SceneHost } from '../stage/Stage';
import { CODE_TOOLS, DOC_TOOLS, EXTRA_TOOLS, JIRA_AT, ROVO_GATE, ROVO_START, RovoAtlassian, SLOTS } from './rovoAtlassian';

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

describe('Rovo and Jira, the quarterback', () => {
  it('starts with only Rovo: no gate, no Jira, no board yet', () => {
    const { stage } = testStage();
    const scene = new RovoAtlassian(stage);
    expect(scene.rovo.drone.position.distanceTo(ROVO_START)).toBe(0);
    expect(scene.gate.visible).toBe(false);
    expect(scene.jira.visible).toBe(false);
    expect(scene.hub.plate.visible).toBe(false);
    expect(scene.hub.kanban.visible).toBe(false);
    expect(scene.accessLine.drawn).toBe(0);
    expect(scene.hub.board).toHaveLength(0);
    expect(scene.lock.shown).toBe(0);
    expect(scene.jira.emblem.visible).toBe(false);
  });

  it('the access line runs along the grid, never diagonal: straight runs and a rounded corner', () => {
    const { stage } = testStage();
    const scene = new RovoAtlassian(stage);
    let onGrid = 0;
    const N = 200;
    for (let i = 0; i <= N; i++) {
      const t = scene.accessLine.curve.getTangentAt(i / N);
      if (Math.abs(t.x) < 1e-3 || Math.abs(t.z) < 1e-3) onGrid++;
    }
    // All of it but the short rounded bend.
    expect(onGrid / (N + 1)).toBeGreaterThan(0.8);
  });

  it('comes in progressively: Rovo, then the gate as it flies over and authenticates, then Jira, then work, then the board', async () => {
    const { stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    const order: string[] = [];
    const mark = (name: string, now: boolean) => now && !order.includes(name) && order.push(name);
    void scene.start();
    await run(20, () => {
      mark('gate', scene.gate.visible);
      mark('at gate', scene.rovo.drone.position.distanceTo(ROVO_GATE) < 1e-3);
      mark('open', scene.gate.state === 'open');
      mark('jira', scene.jira.visible);
      mark('working', scene.inJira);
      mark('board', scene.hub.kanban.visible);
      mark('task', scene.hub.board.length > 0);
    });
    scene.stop();
    expect(order).toEqual(['gate', 'at gate', 'open', 'jira', 'working', 'board', 'task']);
    expect(scene.gate.scale.x).toBeCloseTo(1);
    expect(scene.jira.scale.x).toBeCloseTo(1.35);
  });

  it('authenticates at the gate, then moves into Jira and works from there', async () => {
    const { stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    const gate = new Set<string>();
    void scene.start();
    await run(16, () => gate.add(scene.gate.state));
    expect([...gate]).toEqual(expect.arrayContaining(['thinking', 'open']));
    expect(scene.inJira).toBe(true);
    expect(scene.rovo.drone.position.distanceTo(JIRA_AT)).toBeLessThan(1e-3);
    expect(scene.accessLine.drawn).toBe(1);
    // Rovo through, the gate locks behind it.
    expect(scene.lock.shown).toBe(1);
    expect(scene.lock.shut).toBe(1);
    expect(scene.gate.state).toBe('off');
    scene.stop();
  });

  it('sub-agents spawn out of Rovo, take tasks, spin up their own (varied) tools, and every task comes back done in Jira', async () => {
    const { root, stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    const seen = new Set<Object3D>();
    const births: number[] = [];
    let maxSubs = 0;
    void scene.start();
    await run(120, () => {
      for (const o of root.children) {
        if (!(o instanceof Drone) || !o.subAgent || seen.has(o)) continue;
        seen.add(o);
        // Born inside Rovo (in Jira), not on the floor.
        births.push(o.rig.hover.getWorldPosition(new Vector3()).distanceTo(scene.rovo.drone.rig.hover.getWorldPosition(new Vector3())));
        expect(o.scale.x).toBeCloseTo(0.58);
      }
      maxSubs = Math.max(maxSubs, root.children.filter((o) => o instanceof Drone && o.subAgent && o.visible).length);
    });
    scene.stop();
    await run(25);
    expect(births.length).toBeGreaterThan(2);
    for (const d of births) expect(d).toBeLessThan(0.3);
    expect(maxSubs).toBeLessThanOrEqual(scene.crew);
    // Each job spun up a code tool, a docs tool, and sometimes a third, on a free spot; the sets vary.
    for (const job of scene.jobs) {
      expect(CODE_TOOLS).toContain(job.kinds[0]);
      expect(DOC_TOOLS).toContain(job.kinds[1]);
      if (job.kinds[2]) expect(EXTRA_TOOLS).toContain(job.kinds[2]);
      expect(SLOTS.some((s) => s.distanceTo(job.spot) < 1e-6)).toBe(true);
    }
    expect(new Set(scene.jobs.map((j) => j.kinds.join())).size).toBeGreaterThan(1);
    // Every task came home done to Jira; toolsets and ties are gone once the work is over.
    expect(scene.hub.done).toBe(scene.jobs.length);
    expect(scene.toolsets.size).toBe(0);
    expect(scene.hub.ties.size).toBe(0);
    expect(scene.out).toBe(0);
  });

  it('the kanban board moves: tasks come into To do, go to In progress, finish in Done, and slide off', async () => {
    const { stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    const seen = [false, false, false];
    void scene.start();
    await run(60, () => scene.hub.kanban.columns.forEach((c, i) => c.length && (seen[i] = true)));
    scene.stop();
    expect(seen).toEqual([true, true, true]);
    for (const c of scene.hub.kanban.columns) expect(c.length).toBeLessThanOrEqual(4);
    // Done doesn't pile up: finished cards slide off.
    expect(scene.hub.kanban.columns[2].length).toBeLessThan(scene.hub.done);
  });

  it("a tool's name grows in and folds away with it: never more name than tool", async () => {
    const { stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    let seen = 0;
    let ahead = false;
    void scene.start();
    await run(40, () => {
      for (const tools of scene.toolsets.values())
        for (const n of tools) {
          seen++;
          if (n.labelOpacity > n.scale.x / 0.85 + 0.05) ahead = true;
        }
    });
    scene.stop();
    expect(seen).toBeGreaterThan(0);
    expect(ahead).toBe(false);
  });

  it('never puts two toolsets on the same spot at once', async () => {
    const { stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 7);
    let clash = false;
    void scene.start();
    await run(90, () => {
      const spots = [...scene.toolsets.keys()].map((id) => scene.jobs.find((j) => j.id === id)!.spot);
      for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) if (spots[i].distanceTo(spots[j]) < 1e-6) clash = true;
    });
    scene.stop();
    expect(clash).toBe(false);
  });
});
