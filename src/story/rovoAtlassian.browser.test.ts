import { type Curve, Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Branch } from '../primitives/branch/Branch';
import { Drone } from '../primitives/drone/Drone';
import { GraphEdge } from '../primitives/graph/GraphEdge';
import type { SceneHost } from '../stage/Stage';
import { JIRA_AT, PLACES, ROVO_GATE, ROVO_START, RovoAtlassian } from './rovoAtlassian';
import type { SystemKind } from '../primitives/node/emblems';
import { SystemNode } from '../primitives/node/SystemNode';
import { TASK_TYPES } from './rovoTasks';

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

  it('every line runs along the grid, never diagonal', async () => {
    const { root, stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    const offGrid = (curve: Curve<Vector3>) => {
      let on = 0;
      for (let i = 0; i <= 100; i++) {
        const t = curve.getTangentAt(i / 100);
        if (Math.abs(t.x) < 1e-3 || Math.abs(t.z) < 1e-3) on++;
      }
      return on / 101 < 0.75;
    };
    let lines = 0;
    let bad = 0;
    void scene.start();
    await run(60, () => {
      for (const o of root.children) {
        const curve = o instanceof Branch ? o.curve : o instanceof GraphEdge ? o.path : null;
        if (!curve) continue;
        lines++;
        if (offGrid(curve)) bad++;
      }
    });
    scene.stop();
    expect(lines).toBeGreaterThan(0);
    expect(bad).toBe(0);
  });

  it('comes in progressively: Rovo, the gate, auth, the line, then Jira, then work, then the board', async () => {
    const { stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    const order: string[] = [];
    const mark = (name: string, now: boolean) => now && !order.includes(name) && order.push(name);
    void scene.start();
    await run(20, () => {
      mark('gate', scene.gate.visible);
      mark('at gate', scene.rovo.drone.position.distanceTo(ROVO_GATE) < 1e-3);
      mark('open', scene.gate.state === 'open');
      mark('line', scene.accessLine.drawn > 0.99);
      mark('jira', scene.jira.visible);
      mark('working', scene.inJira);
      mark('board', scene.hub.kanban.visible);
      mark('task', scene.hub.board.length > 0);
    });
    scene.stop();
    expect(order).toEqual(['gate', 'at gate', 'open', 'line', 'jira', 'working', 'board', 'task']);
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
    expect(scene.gate.state).toBe('open');
    scene.stop();
  });

  it('copies of Rovo come out of Rovo, run their tasks step by step, working only over real nodes, and every task comes back done', async () => {
    const { root, stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    const seen = new Set<Object3D>();
    const births: number[] = [];
    let maxSubs = 0;
    let offNode = 0;
    void scene.start();
    await run(150, () => {
      for (const o of root.children) {
        if (!(o instanceof Drone) || !o.subAgent || seen.has(o)) continue;
        seen.add(o);
        births.push(o.rig.hover.getWorldPosition(new Vector3()).distanceTo(scene.rovo.drone.rig.hover.getWorldPosition(new Vector3())));
        expect(o.scale.x).toBeCloseTo(0.58);
      }
      maxSubs = Math.max(maxSubs, root.children.filter((o) => o instanceof Drone && o.subAgent && o.visible).length);
      // A copy at work is always over the node it works: never over empty floor.
      for (const [drone, node] of scene.working) if (Math.hypot(drone.position.x - node.position.x, drone.position.z - node.position.z) > 0.05) offNode++;
    });
    scene.stop();
    await run(40);
    expect(births.length).toBeGreaterThan(2);
    for (const d of births) expect(d).toBeLessThan(0.3);
    expect(maxSubs).toBeLessThanOrEqual(scene.crew);
    expect(offNode).toBe(0);
    for (const t of scene.tasks) expect(TASK_TYPES).toContain(t.task.type);
    // Every task ran all its steps and came back done to Jira.
    for (const t of scene.tasks) expect(t.done).toBe(t.task.steps.length);
    expect(scene.hub.done).toBe(scene.tasks.length);
    expect(scene.out).toBe(0);
    expect(scene.working.size).toBe(0);
  });

  it('systems come up on call: the line draws first, then the node; Teamwork Graph apps stay, third-party tools go when done', async () => {
    const { root, stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 5);
    let nodeBeforeLine = 0;
    const appeared = new Set<SystemKind>();
    void scene.start();
    await run(150, () => {
      for (const o of root.children) {
        if (!(o instanceof SystemNode) || o.kind === 'jira' || o.scale.x < 0.01) continue;
        appeared.add(o.kind);
        const line = root.children.some((e) => e instanceof GraphEdge && e.drawn > 0.99 && e.path.getPoint(1).distanceTo(o.position) < 0.8);
        if (!line) nodeBeforeLine++;
      }
    });
    scene.stop();
    await run(40);
    expect(appeared.size).toBeGreaterThan(1);
    expect(nodeBeforeLine).toBe(0);
    for (const kind of appeared) expect(PLACES[kind]).toBeDefined();
    // Once everything's done, only the Teamwork Graph apps are still standing.
    const standing = [...scene.systems.placed.keys()];
    for (const kind of standing) expect(['confluence', 'codesearch', 'bitbucket']).toContain(kind);
  });

  it('code tasks squash-merge into the run\'s one repo, and its trunk keeps a commit per merge', async () => {
    const { stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    void scene.start();
    await run(150);
    scene.stop();
    await run(40);
    const code = scene.tasks.filter((t) => t.task.type === 'code');
    expect(code.length).toBeGreaterThan(0);
    for (const t of code) expect(t.task.steps[0].system).toBe(scene.scm);
    expect(scene.trunk.count).toBe(code.length);
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
    expect(scene.hub.kanban.columns[2].length).toBeLessThan(scene.hub.done);
  });
});
