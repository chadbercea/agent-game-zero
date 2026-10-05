import { Object3D } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Status } from '../core/palette';
import { HOVER_HEIGHT } from '../primitives/drone/Drone';
import { Gate, type GateState } from '../primitives/gate/Gate';
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

/** A stand-in Gate (real Gates need a DOM canvas for their glow). `instanceof Gate` still holds. */
function fakeGate(state: GateState): Gate {
  const gate = new Object3D();
  Object.setPrototypeOf(gate, Gate.prototype);
  (gate as unknown as { _state: GateState })._state = state;
  return gate as Gate;
}

describe('attachSignal: gate timing (ILI-909)', () => {
  it('over a gate, the conversation waits for green: none while off or thinking', () => {
    const { stage, drone } = scene('working');
    const gate = fakeGate('off');
    const { link } = attachSignal(stage, drone, gate);
    stage.run(1);
    expect(link.rising.count).toBe(0);
    (gate as unknown as { _state: GateState })._state = 'thinking';
    stage.run(1);
    expect(link.rising.count).toBe(0);
    (gate as unknown as { _state: GateState })._state = 'open';
    stage.run(1);
    expect(link.rising.count).toBeGreaterThan(0);
  });

  it('a red gate gets the one-shot only, never two streams', () => {
    const { stage, drone } = scene('stopped');
    const { link } = attachSignal(stage, drone, fakeGate('denied'));
    stage.run(0.2);
    expect(link.burst.count).toBeGreaterThan(0);
    expect(link.rising.count).toBe(0);
    expect(link.falling.count).toBe(0);
  });

  it('closing the gate quiets the link before the drone needs to move', () => {
    const { stage, drone } = scene('working');
    const gate = fakeGate('open');
    const signal = attachSignal(stage, drone, gate);
    stage.run(1);
    expect(signal.quiet()).toBe(false);
    (gate as unknown as { _state: GateState })._state = 'off';
    stage.run(0.4);
    expect(signal.quiet()).toBe(true);
  });
});
