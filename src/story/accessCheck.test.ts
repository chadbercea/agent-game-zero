import { Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import type { Status } from '../core/palette';
import type { GateState } from '../primitives/gate/Gate';
import type { TickFn } from '../stage/Stage';
import { accessCheck, THINK_SECONDS } from './accessCheck';

function clock() {
  const ticks: TickFn[] = [];
  return {
    onTick: (fn: TickFn) => {
      ticks.push(fn);
      return () => ticks.splice(ticks.indexOf(fn), 1);
    },
    /** Advance stage time, letting promise continuations run between frames. */
    async run(seconds: number, dt = 1 / 60) {
      for (let t = 0; t < seconds; t += dt) {
        for (const fn of [...ticks]) fn(dt, t);
        await Promise.resolve();
        await Promise.resolve();
      }
    },
  };
}

function fakeDrone(x: number, z: number) {
  const drone = new Object3D();
  drone.position.set(x, 0, z);
  return Object.assign(drone, { status: 'waiting' as Status, rig: { tilt: new Object3D() } });
}

function fakeGate(works: boolean, x = 0, z = 0) {
  return { state: 'off' as GateState, works, position: { x, z } };
}

describe('accessCheck', () => {
  it('flies to a gray gate, thinks, then opens green and the drone gets to work', async () => {
    const stage = clock();
    const drone = fakeDrone(4, 0);
    const gate = fakeGate(true);
    let result: boolean | undefined;
    void accessCheck(stage, drone, gate).then((r) => (result = r));

    await stage.run(0.1);
    expect(gate.state).toBe('off'); // still approaching a gray gate
    expect(drone.status).toBe('working');

    await stage.run(1.8); // a 4-unit hop at FLIGHT_SPEED takes ~1.7 s
    expect(gate.state).toBe('thinking');
    expect(drone.status).toBe('waiting');
    expect(Math.hypot(drone.position.x, drone.position.z)).toBeLessThan(1e-6);

    await stage.run(THINK_SECONDS + 0.1);
    expect(gate.state).toBe('open');
    expect(drone.status).toBe('working');
    expect(result).toBe(true);
  });

  it('pops red when the gate does not work, leaving the drone Stopped for a retry', async () => {
    const stage = clock();
    const drone = fakeDrone(0, 0); // already at the gate: no flight
    const gate = fakeGate(false);
    let result: boolean | undefined;
    void accessCheck(stage, drone, gate).then((r) => (result = r));
    await stage.run(0.05);
    expect(gate.state).toBe('thinking');
    await stage.run(THINK_SECONDS + 0.1);
    expect(gate.state).toBe('denied');
    expect(drone.status).toBe('stopped');
    expect(result).toBe(false);

    // Retry after the system is fixed.
    gate.works = true;
    void accessCheck(stage, drone, gate).then((r) => (result = r));
    await stage.run(THINK_SECONDS + 0.2);
    expect(gate.state).toBe('open');
    expect(result).toBe(true);
  });
});
