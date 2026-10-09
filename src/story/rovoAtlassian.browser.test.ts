import { type Curve, CurvePath, LineCurve3, Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Branch } from '../primitives/branch/Branch';
import { Terminal } from '../primitives/terminal/Terminal';
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
    // Every straight run is along x or z; the only turns are the rounded corners between runs.
    const offGrid = (curve: Curve<Vector3>): boolean => {
      if (curve instanceof CurvePath) return curve.curves.some((c) => offGrid(c as Curve<Vector3>));
      if (!(curve instanceof LineCurve3)) return false;
      const d = curve.v2.clone().sub(curve.v1);
      return Math.abs(d.x) > 1e-3 && Math.abs(d.z) > 1e-3;
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
    // Finished cards are shot to the parent drone, Rovo, not down to the base.
    expect(scene.hub.landed?.distanceTo(scene.rovo.drone.rig.hover.getWorldPosition(new Vector3()))).toBeLessThan(0.05);
    expect(scene.out).toBe(0);
    expect(scene.working.size).toBe(0);
  });

  it('the system reacts to the agents: anything new comes up under a copy, or at the end of a line that has drawn; TWG apps stay, third-party tools go', async () => {
    const { root, stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 5);
    let unprompted = 0;
    const appeared = new Set<SystemKind>();
    const shown = new Set<Object3D>();
    const copies = () => root.children.filter((o): o is Drone => o instanceof Drone && o.subAgent && o.visible);
    void scene.start();
    await run(150, () => {
      for (const o of root.children) {
        const isNew = (o instanceof SystemNode && o.kind !== 'jira') || o instanceof Terminal;
        if (!isNew || o.scale.x < 0.01 || shown.has(o)) continue;
        shown.add(o);
        if (o instanceof SystemNode) appeared.add(o.kind);
        const underCopy = copies().some((c) => Math.hypot(c.position.x - o.position.x, c.position.z - o.position.z) < 0.3);
        const atLine = root.children.some((e) => {
          const curve = e instanceof GraphEdge && e.drawn > 0.99 ? e.path : e instanceof Branch && e.drawn > 0.99 ? e.curve : null;
          // A line meets a node at its edge, or at its plate's edge (the Teamwork Graph's core apps stand on plates).
          const near = (p: Vector3) => p.distanceTo(o.position.clone().setY(0)) < 1.25;
          return !!curve && (near(curve.getPoint(1)) || near(curve.getPoint(0)));
        });
        if (!underCopy && !atLine) unprompted++;
      }
    });
    scene.stop();
    await run(40);
    expect(appeared.size).toBeGreaterThan(1);
    expect(unprompted).toBe(0);
    // Systems stand at their places; worktrees stand in the code lanes, Slack on its own behind its gateway.
    for (const kind of appeared) if (kind !== 'worktree' && kind !== 'slack') expect(PLACES[kind]).toBeDefined();
    // Once everything's done, only the Teamwork Graph apps are still standing.
    const standing = [...scene.systems.placed.keys()];
    for (const kind of standing) expect(['confluence', 'codesearch', 'bitbucket']).toContain(kind);
    // The Teamwork Graph's core stands with Jira, prominent: Confluence and Bitbucket, on plates, a size up.
    for (const kind of ['confluence', 'bitbucket'] as const) {
      const up = scene.systems.placed.get(kind);
      expect(up?.plate).toBeDefined();
      expect(up?.node.scale.x).toBeGreaterThan(1.1);
    }
    expect(scene.scm).toBe('bitbucket');
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

  it('a code task runs like real life: the copy builds its lane, terminal admin → diff → (check in) → tail → pass, merge, deploy, and it collapses the lane before it goes', async () => {
    const { root, stage, run } = testStage();
    // A run with room for three coding copies at once.
    let seed = 1;
    while (new RovoAtlassian(testStage().stage, seed).codeCrew < 3) seed++;
    const scene = new RovoAtlassian(stage, seed);
    const states = new Map<object, string[]>();
    let maxLanes = 0;
    let collapsedAlone = 0;
    const collapsed = new Set<object>();
    const watch = () => {
      for (const lane of scene.lanes) {
        if (!lane) continue;
        // The copy collapses its lane back into itself: it's still over the worktree when the lane has folded.
        if (lane.collapsed && !collapsed.has(lane)) {
          collapsed.add(lane);
          const over = root.children.some((o) => o instanceof Drone && o.subAgent && o.visible && Math.hypot(o.position.x - lane.spot.x, o.position.z - lane.spot.z) < 0.3);
          if (!over) collapsedAlone++;
        }
        const seen = states.get(lane) ?? [];
        const now = lane.terminal.passed ? 'pass' : lane.terminal.state;
        if (seen[seen.length - 1] !== now) seen.push(now);
        states.set(lane, seen);
      }
      maxLanes = Math.max(maxLanes, scene.lanes.filter(Boolean).length);
    };
    void scene.start();
    await run(160, watch);
    scene.stop();
    await run(50, watch);
    const code = scene.tasks.filter((t) => t.task.type === 'code');
    expect(code.length).toBeGreaterThan(1);
    // Every lane that finished went through the steps in order.
    const finished = [...states.values()].filter((s) => s.includes('pass'));
    expect(finished.length).toBe(code.length);
    for (const s of finished) expect(s.filter((x) => x !== 'off')).toEqual(['admin', 'diff', 'tail', 'pass']);
    expect(scene.trunk.count).toBe(code.length);
    expect(scene.output).toBeDefined();
    expect(collapsed.size).toBe(code.length);
    expect(collapsedAlone).toBe(0);
    // Coding copies work in parallel, one per lane, never more than the run allows.
    expect(maxLanes).toBeGreaterThanOrEqual(2);
    expect(maxLanes).toBeLessThanOrEqual(scene.codeCrew);
    // Lanes are taken down once their tasks are done.
    expect(scene.lanes.every((l) => l === null)).toBe(true);
    // Only the user's terminal stays; lane terminals go with their lanes.
    expect(root.children.some((o) => o instanceof Terminal && o !== scene.terminal)).toBe(false);
  });

  it('mini-system loops: writes stay at the system, third-party tools plug in through a connector, spec loops report to the user\'s terminal, at most loopCrew at once', async () => {
    const { stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    let tooMany = 0;
    let twgWithPlug = 0;
    let thirdPartyWithoutPlug = 0;
    const watch = () => {
      if (scene.out - scene.codeOut > scene.loopCrew) tooMany++;
      for (const up of scene.systems.placed.values()) {
        if (up.permanent && up.connector) twgWithPlug++;
        if (!up.permanent && !up.connector) thirdPartyWithoutPlug++;
      }
    };
    void scene.start();
    await run(200, watch);
    scene.stop();
    await run(50, watch);
    expect(tooMany).toBe(0);
    expect(twgWithPlug).toBe(0);
    expect(thirdPartyWithoutPlug).toBe(0);
    // Writes to a Teamwork Graph app stay there.
    const wroteTwg = scene.tasks.some((t) => t.task.steps.some((st) => st.action !== 'read' && ['confluence', 'codesearch'].includes(st.system)));
    if (wroteTwg) expect([...scene.systems.placed.values()].some((up) => up.writeBacks.length > 0)).toBe(true);
    // Every spec loop ended by updating the user's terminal.
    const specs = scene.tasks.filter((t) => t.task.reportToUser).length;
    expect(specs).toBeGreaterThan(0);
    expect(scene.userReports).toBe(specs);
    expect(scene.terminal).toBeDefined();
  });

  it('Slack: comes up for the first copy that sends a message, behind its glass gateway, and stays busy both ways with or without tasks', async () => {
    const { stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    let chattering = -1;
    void scene.start();
    await run(200, () => {
      if (chattering < 0 && scene.slack.up) chattering = scene.slack.messages;
    });
    const slackTasks = scene.tasks.filter((t) => t.task.type === 'slack');
    expect(slackTasks.length).toBeGreaterThan(0);
    expect(scene.slack.up).toBe(true);
    expect(scene.slack.gateway.built).toBe(1);
    expect(scene.slack.gateway.conduit.streams).toBe(1);
    expect(scene.slack.toJira.drawn).toBe(1);
    expect(scene.slack.node.kind).toBe('slack');
    // Busy: many more messages than tasks ever sent, and it keeps going after the work stops.
    expect(scene.slack.messages - chattering).toBeGreaterThan(slackTasks.length * 5);
    scene.stop();
    await run(40);
    const after = scene.slack.messages;
    await run(10);
    expect(scene.slack.messages).toBeGreaterThan(after + 5);
    for (const t of slackTasks) expect(t.done).toBe(1);
  });

  it('copies stay on: each comes out of Rovo once, and after a task waits where it is for its next ticket (no trip home until the work stops)', async () => {
    const { root, stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    const copies = () => root.children.filter((o) => o instanceof Drone && o.subAgent);
    let left = 0;
    let waited = 0;
    let seen = 0;
    void scene.start();
    await run(150, () => {
      const now = copies();
      if (now.length < seen) left++;
      seen = Math.max(seen, now.length);
      if (now.some((d) => (d as Drone).status === 'waiting' && (d as Drone).position.distanceTo(scene.rovo.drone.position) > 1)) waited++;
    });
    expect(seen).toBe(scene.crew);
    expect(left).toBe(0);
    // Copies took ticket after ticket, waiting out in the grid in between.
    expect(scene.tasks.length).toBeGreaterThan(scene.crew * 2);
    expect(waited).toBeGreaterThan(0);
    scene.stop();
    await run(50);
    expect(copies().length).toBe(0);
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
