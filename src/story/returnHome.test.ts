import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, QuadraticBezierCurve3, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Status } from '../core/palette';
import { HOVER_HEIGHT, SUB_AGENT_SCALE } from '../primitives/drone/Drone';
import { EMBLEM_SCALE } from '../primitives/node/SystemNode';
import type { TickFn } from '../stage/Stage';
import type { CrewMember } from './fanOut';
import { returnHome } from './returnHome';

function clock() {
  const ticks: TickFn[] = [];
  return {
    add: vi.fn(),
    onTick: (fn: TickFn) => {
      ticks.push(fn);
      return () => ticks.splice(ticks.indexOf(fn), 1);
    },
    async run(seconds: number, dt = 1 / 60) {
      for (let t = 0; t < seconds; t += dt) {
        for (const fn of [...ticks]) fn(dt, t);
        await Promise.resolve();
        await Promise.resolve();
      }
    },
  };
}

function drone(x: number, z: number, scale = 1) {
  const root = new Object3D();
  root.position.set(x, 0, z);
  root.scale.setScalar(scale);
  const hover = new Object3D();
  hover.position.y = HOVER_HEIGHT;
  root.add(hover);
  return Object.assign(root, { status: 'waiting' as Status, rig: { hover, tilt: new Object3D() } });
}

describe('returnHome', () => {
  it('carries the product home along the branch, docks into the parent, despawns, and restores the node', async () => {
    const stage = clock();
    const gateAt = new Vector3(0, 0, 0);
    const nodeAt = new Vector3(-4, 0, -6);
    const parent = drone(gateAt.x, gateAt.z);
    const subDrone = drone(nodeAt.x, nodeAt.z, SUB_AGENT_SCALE);
    const despawn = vi.fn();
    const stop = vi.fn();
    const emblem = new Group();
    emblem.visible = false;
    const node = { light: 'waiting' as string, emblem };
    const product = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const job = Object.assign(new Group(), { product, dispose: vi.fn() });
    job.add(product);
    const route = new QuadraticBezierCurve3(gateAt, new Vector3(-1, 0, -4), nodeAt);
    const member = { sub: { drone: subDrone, despawn }, node, job, stop } as unknown as CrewMember;

    let done = false;
    void returnHome(stage, member, parent as never, route).then(() => (done = true));
    await stage.run(0.05);
    // Picked up: the product hangs under the sub-agent; the node is dark; the job's per-frame sync stopped.
    expect(subDrone.rig.hover.children).toHaveLength(1);
    expect(product.visible).toBe(false);
    expect(node.light).toBe('off');
    expect(stop).toHaveBeenCalledOnce();
    expect(subDrone.status).toBe('working');

    await stage.run(8);
    expect(done).toBe(true);
    // Docked: over the gate, raised into the parent's body, shrunk.
    expect(Math.hypot(subDrone.position.x - gateAt.x, subDrone.position.z - gateAt.z)).toBeLessThan(1e-6);
    expect(subDrone.position.y).toBeGreaterThan(1);
    expect(subDrone.scale.x).toBeLessThan(SUB_AGENT_SCALE * 0.5);
    expect(subDrone.rig.hover.children).toHaveLength(0); // product delivered
    expect(despawn).toHaveBeenCalledOnce();
    expect(job.dispose).toHaveBeenCalledOnce();
    expect(emblem.visible).toBe(true);
    expect(emblem.scale.x).toBeCloseTo(EMBLEM_SCALE);
  });
});
