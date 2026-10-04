import { Group, Object3D } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LINEAGES, type Status } from '../core/palette';
import type { DroneOptions } from '../primitives/drone/Drone';
import { Connection } from '../primitives/connection/Connection';
import type { Packet } from '../primitives/packet/Packet';
import { Population } from './Population';
import type { SpawnedAgent, SpawnOptions } from './spawnAgent';
import type { DetailHost, TickFn } from './Stage';

/** A stage stand-in: records ticks and the Detail provider, renders nothing. */
function fakeStage() {
  const ticks: TickFn[] = [];
  const stage = {
    detail: null as (() => Object3D[]) | null,
    add: vi.fn(),
    onTick: (fn: TickFn) => {
      ticks.push(fn);
      return () => ticks.splice(ticks.indexOf(fn), 1);
    },
    setDetail(provider: (() => Object3D[]) | null) {
      stage.detail = provider;
    },
    tick(dt = 1 / 60) {
      for (const fn of [...ticks]) fn(dt, 0);
    },
  };
  return stage satisfies DetailHost;
}

/** Agents with just the fields Population reads: unit, drone status/lineage/hover, task tether. */
const spawnCalls: SpawnOptions[] = [];

function fakeSpawnAgent(_stage: unknown, x: number, z: number, options: SpawnOptions): SpawnedAgent {
  spawnCalls.push(options);
  const unit = new Group();
  unit.position.set(x, 0, z);
  const hover = new Object3D();
  unit.add(hover);
  return {
    unit,
    drone: { name: options.name, status: options.status ?? 'waiting', lineage: options.lineage, subAgent: Boolean(options.subAgent), rig: { hover } },
    task: { rig: { tether: { visible: true } } },
    despawn: vi.fn(),
  } as unknown as SpawnedAgent;
}

interface Sent {
  from: SpawnedAgent;
  to: SpawnedAgent;
  packet: Packet;
  land: () => void;
  cancel: ReturnType<typeof vi.fn>;
}

function setup() {
  const stage = fakeStage();
  const sent: Sent[] = [];
  const population = new Population(stage, {
    spawnAgent: fakeSpawnAgent,
    sendPacket: (_stage, from, to) => {
      const packet = Object.assign(new Object3D(), { trail: { visible: true } }) as unknown as Packet;
      let land = () => {};
      const landed = new Promise<void>((resolve) => (land = resolve));
      const cancel = vi.fn(() => land());
      sent.push({ from, to, packet, land, cancel });
      return { packet, landed, cancel };
    },
  });
  const spawn = (options: DroneOptions & { parent?: SpawnedAgent } = {}) => population.spawn(0, 0, options);
  const setStatus = (agent: SpawnedAgent, status: Status) => {
    agent.drone.status = status;
    stage.tick();
  };
  return { stage, population, sent, spawn, setStatus };
}

describe('Population lineage model', () => {
  it('tracks parents and children', () => {
    const { population, spawn } = setup();
    const root = spawn();
    const a = spawn({ parent: root });
    const b = spawn({ parent: root });
    const grandchild = spawn({ parent: a });

    expect(population.parentOf(root)).toBeUndefined();
    expect(population.parentOf(a)).toBe(root);
    expect(population.parentOf(grandchild)).toBe(a);
    expect(population.childrenOf(root)).toEqual([a, b]);
    expect(population.childrenOf(b)).toEqual([]);
  });

  it('family() returns the whole tree from any member, and nothing outside it', () => {
    const { population, spawn } = setup();
    const root = spawn();
    const a = spawn({ parent: root });
    const grandchild = spawn({ parent: a });
    const b = spawn({ parent: root });
    const stranger = spawn();

    for (const member of [root, a, grandchild, b]) {
      expect(new Set(population.family(member))).toEqual(new Set([root, a, grandchild, b]));
    }
    expect(population.family(stranger)).toEqual([stranger]);
  });

  it('sub-agents inherit their parent lineage', () => {
    const { spawn } = setup();
    const root = spawn();
    const child = spawn({ parent: root });
    expect(child.drone.lineage).toBe(root.drone.lineage);
    expect(child.drone.subAgent).toBe(true);
    expect(root.drone.subAgent).toBe(false);
  });

  it('new roots take the least-used lineage color', () => {
    const { spawn } = setup();
    const firstRound = LINEAGES.map(() => spawn());
    // Sub-agents share their parent's color and don't count toward root usage.
    spawn({ parent: firstRound[0] });
    spawn({ parent: firstRound[0] });
    expect(new Set(firstRound.map((a) => a.drone.lineage))).toEqual(new Set(LINEAGES));

    const secondRound = LINEAGES.map(() => spawn());
    expect(new Set(secondRound.map((a) => a.drone.lineage))).toEqual(new Set(LINEAGES));
  });

  it('sub-agents emerge from their parent; top-level agents descend (ILI-876)', () => {
    const { spawn } = setup();
    spawnCalls.length = 0;
    const root = spawn();
    spawn({ parent: root });
    expect(spawnCalls[0].arrival).toEqual({ kind: 'descend' });
    expect(spawnCalls[1].arrival).toEqual({ kind: 'emerge', from: root.drone.rig.hover });
  });

  it('respects an explicit lineage', () => {
    const { spawn } = setup();
    expect(spawn({ lineage: 'magenta' }).drone.lineage).toBe('magenta');
  });
});

describe('Population packet routing (reactToStatus)', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => (ctx = setup()));

  it('Working hands off to a sub-agent', () => {
    const root = ctx.spawn();
    const child = ctx.spawn({ parent: root });
    ctx.setStatus(root, 'working');
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0].from).toBe(root);
    expect(ctx.sent[0].to).toBe(child);
  });

  it('Working with no sub-agents hands off to the parent or a sibling', () => {
    const root = ctx.spawn();
    const a = ctx.spawn({ parent: root });
    const b = ctx.spawn({ parent: root });
    for (let i = 0; i < 20; i++) {
      ctx.setStatus(a, 'waiting');
      ctx.setStatus(a, 'working');
    }
    const targets = new Set(ctx.sent.map((s) => s.to));
    expect([...targets].every((t) => t === root || t === b)).toBe(true);
    expect(ctx.sent.every((s) => s.from === a)).toBe(true);
  });

  it('Stopped escalates to the parent', () => {
    const root = ctx.spawn();
    const child = ctx.spawn({ parent: root });
    ctx.setStatus(child, 'stopped');
    expect(ctx.sent).toHaveLength(1);
    expect(ctx.sent[0].from).toBe(child);
    expect(ctx.sent[0].to).toBe(root);
  });

  it('Waiting sends nothing', () => {
    const root = ctx.spawn({ status: 'working' });
    ctx.spawn({ parent: root });
    ctx.setStatus(root, 'waiting');
    expect(ctx.sent).toHaveLength(0);
  });

  it('only reacts to changes, not to a status that stays the same', () => {
    const root = ctx.spawn();
    ctx.spawn({ parent: root });
    ctx.setStatus(root, 'working');
    ctx.stage.tick();
    ctx.stage.tick();
    expect(ctx.sent).toHaveLength(1);
  });

  it('every member of a family can emit packets', () => {
    const root = ctx.spawn();
    const a = ctx.spawn({ parent: root });
    const b = ctx.spawn({ parent: root });
    const grandchild = ctx.spawn({ parent: a });
    for (const agent of [root, a, b, grandchild]) ctx.setStatus(agent, 'working');
    expect(new Set(ctx.sent.map((s) => s.from))).toEqual(new Set([root, a, b, grandchild]));
  });

  it('a top-level agent with no sub-agents stays silent (by design, ILI-874)', () => {
    const loner = ctx.spawn();
    ctx.setStatus(loner, 'working');
    ctx.setStatus(loner, 'stopped');
    expect(ctx.sent).toHaveLength(0);
  });
});

describe('Population despawn (cascade, ILI-875)', () => {
  it('removes the agent and tears it down', () => {
    const { population, spawn } = setup();
    const root = spawn();
    const leaf = spawn({ parent: root });
    population.despawn(leaf);
    expect(population.agents).toEqual([root]);
    expect(population.childrenOf(root)).toEqual([]);
    expect(leaf.despawn).toHaveBeenCalledOnce();
  });

  it('despawning a parent removes its whole subtree and nothing else', () => {
    const { population, spawn } = setup();
    const root = spawn();
    const a = spawn({ parent: root });
    const grandchild = spawn({ parent: a });
    const b = spawn({ parent: root });
    const stranger = spawn();

    population.despawn(a);
    expect(population.agents).toEqual([root, b, stranger]);
    expect(a.despawn).toHaveBeenCalledOnce();
    expect(grandchild.despawn).toHaveBeenCalledOnce();
    expect(population.childrenOf(root)).toEqual([b]);

    population.despawn(root);
    expect(population.agents).toEqual([stranger]);
    expect(b.despawn).toHaveBeenCalledOnce();
  });

  it('never leaves a sub-agent-scale root behind', () => {
    const { population, spawn } = setup();
    const root = spawn();
    spawn({ parent: spawn({ parent: root }) });
    spawn({ parent: root });
    population.despawn(root);
    for (const agent of population.agents) {
      expect(!population.parentOf(agent) && agent.drone.subAgent).toBe(false);
    }
    expect(population.agents).toEqual([]);
  });

  it('frees the lineage color, so roots stay distinct afterwards', () => {
    const { population, spawn } = setup();
    const roots = LINEAGES.map(() => spawn());
    for (const root of roots) spawn({ parent: root });
    const freed = roots[2].drone.lineage;
    population.despawn(roots[2]);
    const replacement = spawn();
    expect(replacement.drone.lineage).toBe(freed);
    const rootColors = population.agents.filter((a) => !population.parentOf(a)).map((a) => a.drone.lineage);
    expect(new Set(rootColors).size).toBe(rootColors.length);
  });

  it('cancels packets in flight to or from removed agents', () => {
    const { stage, population, sent, spawn, setStatus } = setup();
    const root = spawn();
    const child = spawn({ parent: root });
    const other = spawn();
    const otherChild = spawn({ parent: other });
    setStatus(child, 'stopped'); // child → root
    setStatus(root, 'working'); // root → child
    setStatus(other, 'working'); // other → otherChild (unaffected)

    population.focus(other);
    population.despawn(root);
    const [up, down, unrelated] = sent;
    expect(up.cancel).toHaveBeenCalledOnce();
    expect(down.cancel).toHaveBeenCalledOnce();
    expect(unrelated.cancel).not.toHaveBeenCalled();
    expect(() => stage.tick()).not.toThrow();
    expect(stage.detail!()).toContain(unrelated.packet);
    expect(stage.detail!()).toContain(otherChild.unit);
  });

  it('keeps Detail on a surviving family and drops only the removed connections', () => {
    const { stage, population, spawn } = setup();
    const root = spawn();
    const a = spawn({ parent: root });
    spawn({ parent: root });
    population.focus(root);
    const connectionsBefore = stage.detail!().filter((m) => m instanceof Connection);
    expect(connectionsBefore).toHaveLength(2);

    population.despawn(a);
    expect(stage.detail).not.toBeNull();
    expect(stage.detail!().filter((m) => m instanceof Connection)).toHaveLength(1);
  });

  it('exits Detail when the focused agent itself is removed', () => {
    const { stage, population, spawn } = setup();
    const root = spawn();
    const child = spawn({ parent: root });
    population.focus(child);
    population.despawn(root);
    expect(stage.detail).toBeNull();
  });

  it('clear() removes everyone', () => {
    const { population, spawn } = setup();
    const root = spawn();
    spawn({ parent: root });
    spawn();
    population.clear();
    expect(population.agents).toEqual([]);
  });
});

describe('Population Detail view', () => {
  it('keeps the focused family, its connections, and packets it sent; nothing else', async () => {
    const { stage, population, sent, spawn, setStatus } = setup();
    const root = spawn();
    const child = spawn({ parent: root });
    const stranger = spawn();
    const strangerChild = spawn({ parent: stranger });

    population.focus(child);
    expect(stage.detail).not.toBeNull();

    setStatus(root, 'working'); // family packet: root → child
    setStatus(stranger, 'working'); // outside packet: stranger → strangerChild
    const familyPacket = sent.find((s) => s.from === root)!.packet;
    const outsidePacket = sent.find((s) => s.from === stranger)!.packet;

    const members = stage.detail!();
    expect(members).toContain(root.unit);
    expect(members).toContain(child.unit);
    expect(members).not.toContain(stranger.unit);
    expect(members).not.toContain(strangerChild.unit);
    expect(members).toContain(familyPacket);
    expect(members).not.toContain(outsidePacket);
    // One parent → child connection for the focused family.
    const connections = members.filter((m) => m instanceof Connection);
    expect(connections).toHaveLength(1);

    // Landed packets leave the view.
    sent.find((s) => s.from === root)!.land();
    await Promise.resolve();
    await Promise.resolve();
    expect(stage.detail!()).not.toContain(familyPacket);
  });

  it('shows dotted lines only for the focused family', () => {
    const { stage, population, sent, spawn, setStatus } = setup();
    const root = spawn();
    const child = spawn({ parent: root });
    const stranger = spawn();
    spawn({ parent: stranger });

    setStatus(root, 'working');
    setStatus(stranger, 'working');
    stage.tick();
    expect([root, child, stranger].every((a) => !a.task.rig.tether.visible)).toBe(true);
    expect(sent.every((s) => !s.packet.trail.visible)).toBe(true);

    population.focus(root);
    stage.tick();
    expect(root.task.rig.tether.visible).toBe(true);
    expect(child.task.rig.tether.visible).toBe(true);
    expect(stranger.task.rig.tether.visible).toBe(false);
    expect(sent.find((s) => s.from === root)!.packet.trail.visible).toBe(true);
    expect(sent.find((s) => s.from === stranger)!.packet.trail.visible).toBe(false);
  });

  it('focus(undefined) returns to Runtime', () => {
    const { stage, population, spawn } = setup();
    population.focus(spawn());
    population.focus(undefined);
    expect(stage.detail).toBeNull();
  });

  it('a sub-agent spawned into a focused family joins the view', () => {
    const { stage, population, spawn } = setup();
    const root = spawn();
    population.focus(root);
    const late = spawn({ parent: root });
    expect(stage.detail!()).toContain(late.unit);
  });
});
