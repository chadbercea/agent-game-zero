import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Drone } from '../primitives/drone/Drone';
import { SystemNode } from '../primitives/node/SystemNode';
import type { SceneHost } from '../stage/Stage';
import { Cloud } from '../primitives/cloud/Cloud';
import { Ticket } from '../primitives/ticket/Ticket';
import { cloudDrop, DRIFT_SPEED, groupOffsets } from './cloudDrop';
import { seededRandom } from '../core/scatter';
import { Intake, RING_FROM, RING_TO, TRIAGE_SCALE } from './intake';

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

function system(spots: [number, number][]) {
  return spots.map(([x, z], i) => {
    const node = new SystemNode({ kind: i === 0 ? 'jira' : i === 1 ? 'confluence' : 'bitbucket' });
    node.position.set(x, 0, z);
    return node;
  });
}

/** How far a point is outside the system's nodes' own box (no padding). */
function beyond(nodes: SystemNode[], p: Vector3) {
  const xs = nodes.map((n) => n.position.x);
  const zs = nodes.map((n) => n.position.z);
  const dx = Math.max(Math.min(...xs) - p.x, 0, p.x - Math.max(...xs));
  const dz = Math.max(Math.min(...zs) - p.z, 0, p.z - Math.max(...zs));
  return Math.hypot(dx, dz);
}

describe('Intake', () => {
  it('clouds drift at one fixed speed (no ramp), easing only as they puff in and out, and a group floats together', async () => {
    const { stage, run } = testStage(30);
    const lead = new Cloud();
    const escort = new Cloud();
    const offset = new Vector3(2, 0.2, 1);
    const ticket = new Ticket(undefined, { label: false });
    const speeds: number[] = [];
    const gaps: number[] = [];
    const sizes: number[] = [];
    let last = new Vector3();
    let done = false;
    void cloudDrop(stage, lead, ticket, new Vector3(), { height: 3, keep: true, escorts: [{ cloud: escort, offset }] }).then(() => (done = true));
    await run(30, () => {
      if (done || !lead.visible) return;
      if (last.lengthSq() > 0) speeds.push(lead.position.distanceTo(last) * 30);
      last = lead.position.clone();
      gaps.push(escort.position.clone().sub(lead.position).distanceTo(offset));
      sizes.push(lead.materialized);
    });
    expect(done).toBe(true);
    // Same speed at the start, over the drop, and at the end: no ramp.
    const mid = speeds.slice(2, -2);
    for (const v of mid) expect(v).toBeCloseTo(DRIFT_SPEED, 1);
    // The escort never leaves its place in the group.
    for (const g of gaps) expect(g).toBeLessThan(1e-6);
    // The ease is at the start and the stop: it puffs in, holds, and puffs out.
    expect(sizes[0]).toBeLessThan(0.1);
    expect(Math.max(...sizes)).toBe(1);
    expect(sizes[sizes.length - 1]).toBeLessThan(0.1);
  });

  it('groups are seeded and spread out around the lead cloud', () => {
    const a = groupOffsets(seededRandom(4), 2);
    const b = groupOffsets(seededRandom(4), 2);
    expect(a.map((v) => v.toArray())).toEqual(b.map((v) => v.toArray()));
    for (const v of a) expect(Math.hypot(v.x, v.z)).toBeGreaterThan(1.5);
  });

  it('drops just outside one node, and all around a big system: the ring follows the footprint', () => {
    const { stage } = testStage();
    const one = system([[0, 0]]);
    const small = new Intake(stage, { system: () => one, jira: one[0], crewFrom: () => [] }, 3);
    const big = system([[0, 0], [0, -6], [6, 0], [6, -6], [-6, 0], [-6, -6], [0, 6], [6, 6], [-6, 6]]);
    const large = new Intake(stage, { system: () => big, jira: big[0], crewFrom: () => [] }, 3);
    const smallSpots = Array.from({ length: 60 }, () => small.spot());
    const largeSpots = Array.from({ length: 60 }, () => large.spot());
    for (const p of smallSpots) {
      expect(p.length()).toBeGreaterThan(RING_FROM);
      expect(p.length()).toBeLessThan(RING_TO + 1.5);
    }
    // Around the big one: every drop outside its nodes, on every side of it.
    for (const p of largeSpots) expect(beyond(big, p)).toBeGreaterThan(0.5);
    expect(largeSpots.some((p) => p.x < -6) && largeSpots.some((p) => p.x > 6)).toBe(true);
    expect(largeSpots.some((p) => p.z < -6) && largeSpots.some((p) => p.z > 6)).toBe(true);
  });

  it('1–3 sub-agents from agents with Jira access pick up the drops and triage them into Jira or Confluence', async () => {
    const { root, stage, run } = testStage();
    const nodes = system([[0, 0], [0, -2.5], [2.5, 0]]);
    nodes.forEach((n) => root.add(n));
    const rovo = new Drone({ name: 'Rovo', lineage: 'cyan' });
    rovo.position.set(1.5, 0, 2.5);
    root.add(rovo);
    const intake = new Intake(stage, { system: () => nodes, jira: nodes[0], confluence: nodes[1], crewFrom: () => [rovo] }, 7);
    expect(nodes[0].scale.x).toBe(TRIAGE_SCALE);
    intake.start();
    let maxSubs = 0;
    let maxBacklog = 0;
    await run(90, () => {
      maxSubs = Math.max(maxSubs, root.children.filter((o) => o instanceof Drone && o.subAgent && o.visible).length);
      maxBacklog = Math.max(maxBacklog, intake.backlog);
    });
    expect(intake.drops.length).toBeGreaterThan(10);
    expect(intake.crew).toBeGreaterThanOrEqual(1);
    expect(intake.crew).toBeLessThanOrEqual(3);
    expect(maxSubs).toBeLessThanOrEqual(intake.crew);
    expect(maxSubs).toBeGreaterThanOrEqual(1);
    // They keep up: the floor never piles up, and nearly everything dropped is triaged.
    expect(maxBacklog).toBeLessThanOrEqual(3);
    expect(intake.routed.length).toBeGreaterThan(intake.drops.length - 4);
    expect(intake.routed).toContain('jira');
    expect(intake.routed).toContain('confluence');
    // Most go to Jira, the triage point.
    expect(intake.routed.filter((r) => r === 'jira').length).toBeGreaterThan(intake.routed.length / 2);
  });

  it('the same seed plays the same run; crew size varies across seeds', async () => {
    const once = async (seed: number) => {
      const { stage, run } = testStage();
      const nodes = system([[0, 0], [0, -2.5]]);
      const rovo = new Drone({ name: 'Rovo' });
      const intake = new Intake(stage, { system: () => nodes, jira: nodes[0], confluence: nodes[1], crewFrom: () => [rovo] }, seed);
      intake.start();
      await run(20);
      return intake.drops.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`).join(' ') + ` ${intake.routed.join(',')}`;
    };
    expect(await once(5)).toEqual(await once(5));
    const crews = new Set<number>();
    const nodes = system([[0, 0]]);
    for (let seed = 1; seed <= 12; seed++) crews.add(new Intake(testStage().stage, { system: () => nodes, jira: nodes[0], crewFrom: () => [] }, seed).crew);
    expect(crews.size).toBeGreaterThan(1);
  });
});
