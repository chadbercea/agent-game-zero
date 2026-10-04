import { Group, Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ArrivalAnimator, DESCEND_DURATION, EMERGE_DURATION } from './ArrivalAnimator';

/** A unit like spawnAgent builds: drone (with a hover point above it) and task, both at the unit origin. */
function unitAt(x: number, z: number, droneScale = 1) {
  const unit = new Group();
  unit.position.set(x, 0, z);
  unit.rotation.y = Math.PI / 4;
  const drone = new Group();
  drone.scale.setScalar(droneScale);
  const hover = new Object3D();
  hover.position.y = 2;
  drone.add(hover);
  const task = new Group();
  task.scale.setScalar(droneScale);
  unit.add(drone, task);
  unit.updateMatrixWorld(true);
  return { unit, drone, hover, task };
}

const world = (o: Object3D) => {
  o.updateWorldMatrix(true, false);
  return o.getWorldPosition(new Vector3());
};

describe('ArrivalAnimator', () => {
  it('emerge starts at the parent hover point and ends at rest', () => {
    const parent = unitAt(0, 0);
    const child = unitAt(4, -3, 0.58);
    const rest = world(child.hover);
    const anim = new ArrivalAnimator(child, { kind: 'emerge', from: parent.hover });

    expect(world(child.hover).distanceTo(world(parent.hover))).toBeLessThan(1e-6);
    expect(child.drone.scale.x).toBeLessThan(0.58);
    expect(child.task.visible).toBe(false);

    anim.update(EMERGE_DURATION / 2);
    const mid = world(child.hover);
    expect(mid.distanceTo(rest)).toBeGreaterThan(0.01);
    expect(mid.distanceTo(world(parent.hover))).toBeGreaterThan(0.01);

    anim.update(EMERGE_DURATION);
    expect(anim.done).toBe(true);
    expect(world(child.hover).distanceTo(rest)).toBeLessThan(1e-6);
    expect(child.drone.scale.x).toBeCloseTo(0.58);
    expect(child.task.scale.y).toBeCloseTo(0.58);
    expect(child.task.visible).toBe(true);
  });

  it('emerge follows a parent that moves mid-flight', () => {
    const parent = unitAt(0, 0);
    const child = unitAt(4, -3, 0.58);
    const anim = new ArrivalAnimator(child, { kind: 'emerge', from: parent.hover });
    // Parent is still descending: its hover point moves before the child's first frame.
    parent.hover.position.y = 5;
    anim.update(0);
    expect(world(child.hover).distanceTo(world(parent.hover))).toBeLessThan(1e-6);
  });

  it('descend drops in from above and lands at rest', () => {
    const agent = unitAt(1, 1);
    const anim = new ArrivalAnimator(agent, { kind: 'descend' });
    expect(agent.drone.position.y).toBeGreaterThan(4);
    anim.update(DESCEND_DURATION);
    expect(anim.done).toBe(true);
    expect(agent.drone.position.length()).toBe(0);
    expect(agent.task.scale.y).toBe(1);
  });

  it('instant is done immediately and leaves everything at rest', () => {
    const agent = unitAt(0, 0, 0.58);
    const anim = new ArrivalAnimator(agent, { kind: 'instant' });
    expect(anim.done).toBe(true);
    expect(agent.drone.position.length()).toBe(0);
    expect(agent.drone.scale.x).toBeCloseTo(0.58);
    expect(agent.task.visible).toBe(true);
  });
});
