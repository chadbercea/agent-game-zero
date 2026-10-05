import { Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Status } from '../core/palette';
import { HOVER_HEIGHT } from '../primitives/drone/Drone';
import type { Drone } from '../primitives/drone/Drone';
import type { TickFn } from './Stage';
import { attachSignal } from './attachSignal';

function scene(status: Status) {
  const ticks: TickFn[] = [];
  const stage = {
    add: vi.fn(),
    onTick: (fn: TickFn) => {
      ticks.push(fn);
      return () => ticks.splice(ticks.indexOf(fn), 1);
    },
    run: (seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 60) for (const fn of [...ticks]) fn(1 / 60, t);
    },
  };
  const base = new Object3D();
  const drone = new Object3D();
  const hover = new Object3D();
  hover.position.y = HOVER_HEIGHT;
  drone.add(hover);
  Object.assign(drone, { status, rig: { hover } });
  return { stage, base, drone: drone as unknown as Drone };
}

describe('attachSignal: the job rule', () => {
  it('runs the dots when no job animation is showing at the base', () => {
    const { stage, base, drone } = scene('working');
    const { link } = attachSignal(stage, drone, base, { showsJob: () => false });
    stage.run(1);
    expect(link.rising.count).toBeGreaterThan(0);
  });

  it('stays silent while a job animation is showing, and resumes when it goes', () => {
    const { stage, base, drone } = scene('working');
    let job = true;
    const { link } = attachSignal(stage, drone, base, { showsJob: () => job });
    stage.run(1);
    expect(link.rising.count).toBe(0);
    job = false;
    stage.run(1);
    expect(link.rising.count).toBeGreaterThan(0);
  });

  it('a stopped drone over a job sends no one-shot either', () => {
    const { stage, base, drone } = scene('stopped');
    const { link } = attachSignal(stage, drone, base, { showsJob: () => true });
    stage.run(0.3);
    expect(link.burst.count).toBe(0);
  });

  it('bases without a job check behave as before', () => {
    const { stage, base, drone } = scene('working');
    const { link } = attachSignal(stage, drone, base);
    stage.run(1);
    expect(link.rising.count).toBeGreaterThan(0);
  });
});
