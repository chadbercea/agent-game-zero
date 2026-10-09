import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Drone } from '../primitives/drone/Drone';
import { ATLASSIAN_KINDS } from '../primitives/node/emblems';
import type { SceneHost } from '../stage/Stage';
import { ROVO_GATE, RovoAtlassian } from './rovoAtlassian';

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

describe('Rovo on the Atlassian grid', () => {
  it('spawns each sub-agent out of Rovo’s body at full size: never from the floor, never scaling', async () => {
    const { root, stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    const seen = new Set<Object3D>();
    const births: { sub: number; rovo: number; apart: number }[] = [];
    const scales = new Set<number>();
    void scene.start();
    await run(20, () => {
      for (const o of root.children) if (o instanceof Drone && o.subAgent) scales.add(+o.scale.x.toFixed(4));
      for (const o of root.children) {
        if (!(o instanceof Drone) || !o.subAgent || seen.has(o)) continue;
        seen.add(o);
        const sub = o.rig.hover.getWorldPosition(new Vector3());
        const rovo = scene.rovo.drone.rig.hover.getWorldPosition(new Vector3());
        births.push({ sub: sub.y, rovo: rovo.y, apart: Math.hypot(sub.x - rovo.x, sub.z - rovo.z) });
      }
    });
    scene.stop();
    expect(births.length).toBeGreaterThan(0);
    // One size, always: sub-agents don't grow or shrink.
    expect([...scales]).toEqual([0.58]);
    for (const b of births) {
      // Born level with Rovo's body (within its bob), right under it: inside Rovo, not on the gate.
      expect(Math.abs(b.sub - b.rovo)).toBeLessThan(0.25);
      expect(b.apart).toBeLessThan(0.05);
    }
  });

  it('starts with Rovo at the center on its gate, Jira already up, and nothing else', () => {
    const { stage } = testStage();
    const scene = new RovoAtlassian(stage);
    expect(scene.rovo.drone.position.distanceTo(ROVO_GATE)).toBe(0);
    expect(scene.map.nodes.map((n) => n.kind)).toEqual([...ATLASSIAN_KINDS]);
    expect(scene.map.nodes.filter((n) => n.visible).map((n) => n.kind)).toEqual(['jira']);
  });

  it('makes Jira a hub: it collects tickets, and Bitbucket and Confluence tie into it and report back', async () => {
    const { stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    void scene.start();
    await run(120);
    scene.stop();
    await run(15);
    // Every tied tool that came up is tied into Jira with a drawn line; nothing else is.
    const tied = scene.called.filter((k) => k === 'bitbucket' || k === 'confluence');
    expect([...scene.hub.ties.keys()].sort()).toEqual([...new Set(tied)].sort());
    for (const edge of scene.hub.ties.values()) expect(edge.drawn).toBe(1);
    // Tickets have come into the rack, and it never holds more than it should.
    expect(scene.hub.rack.length).toBeGreaterThan(0);
    expect(scene.hub.rack.length).toBeLessThanOrEqual(8);
    expect(scene.hub.node.scale.x).toBeGreaterThan(1);
  });

  it('keeps Jira on the grid the whole time: never called up, never put away', async () => {
    const { stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 5);
    const jira = scene.map.nodes[ATLASSIAN_KINDS.indexOf('jira')];
    let alwaysUp = true;
    void scene.start();
    await run(60, () => {
      if (!jira.visible) alwaysUp = false;
    });
    scene.stop();
    expect(alwaysUp).toBe(true);
    expect(scene.called).not.toContain('jira');
  });

  it('gets access, calls its tools up as needed, and 1–3 sub-agents keep work flowing back to Rovo', async () => {
    const { root, stage, run } = testStage();
    const scene = new RovoAtlassian(stage, 3);
    const gate = new Set<string>();
    let maxSubs = 0;
    void scene.start();
    await run(90, () => {
      gate.add(scene.gate.state);
      maxSubs = Math.max(maxSubs, root.children.filter((o) => o instanceof Drone && o.subAgent && o.visible).length);
    });
    scene.stop();
    // Let everyone out come home: then every tool is dark again.
    await run(15);
    expect(scene.out).toBe(0);
    expect(scene.map.nodes.every((n) => n.light === 'off')).toBe(true);
    expect([...gate]).toEqual(expect.arrayContaining(['thinking', 'open']));
    expect(scene.gate.state).toBe('open');
    // Each tool is called up once, the first time Rovo needs it.
    expect(new Set(scene.called).size).toBe(scene.called.length);
    expect(scene.called.length).toBeGreaterThanOrEqual(2);
    for (const kind of scene.called) expect(scene.map.nodes[ATLASSIAN_KINDS.indexOf(kind)].visible).toBe(true);
    expect(scene.delivered.length).toBeGreaterThan(5);
    expect(maxSubs).toBeGreaterThanOrEqual(1);
    expect(maxSubs).toBeLessThanOrEqual(scene.crew);
    expect(scene.crew).toBeLessThanOrEqual(3);
  });
});
