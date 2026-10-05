import { Object3D, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Status } from '../core/palette';
import type { GateState } from '../primitives/gate/Gate';
import type { TickFn } from '../stage/Stage';
import { ACT1_GATE, ATLASSIAN_GATE } from './layout';
import { type TwoActScene, toAtlassian } from './twoActs';

function clock() {
  const ticks: TickFn[] = [];
  return {
    add: vi.fn(),
    onTick: (fn: TickFn) => {
      ticks.push(fn);
      return () => ticks.splice(ticks.indexOf(fn), 1);
    },
    async run(seconds: number, dt = 1 / 30) {
      for (let t = 0; t < seconds; t += dt) {
        for (const fn of [...ticks]) fn(dt, t);
        await Promise.resolve();
        await Promise.resolve();
      }
    },
  };
}

const fakeGate = (at: Vector3, state: GateState) => ({ state, works: true, position: at.clone() });

describe('toAtlassian (the act transition)', () => {
  it('mutes the link first, leaves the Act 1 gate open and green, flies to the Atlassian gate and authenticates', async () => {
    const stage = clock();
    const drone = Object.assign(new Object3D(), { status: 'working' as Status, rig: { tilt: new Object3D() } });
    drone.position.copy(ACT1_GATE);
    const events: string[] = [];
    let quiet = false;
    const signal1 = {
      quiet: () => quiet,
      mute: (m: boolean) => events.push(`mute:${m}`),
    };
    const gate1 = fakeGate(ACT1_GATE, 'open');
    const gate2 = fakeGate(ATLASSIAN_GATE, 'off');
    const scene = {
      drone,
      act1: { gate: gate1, signal: signal1 },
      act2: { gate: gate2 },
    } as unknown as TwoActScene;

    let granted: boolean | undefined;
    void toAtlassian(stage, scene).then((g) => (granted = g));
    await stage.run(0.2);
    // Muted, but not moving until the dots are quiet.
    expect(events).toEqual(['mute:true']);
    expect(drone.position.distanceTo(ACT1_GATE)).toBeLessThan(1e-6);
    quiet = true;
    await stage.run(20);

    expect(granted).toBe(true);
    expect(gate1.state).toBe('open'); // Act 1 stays green
    expect(gate2.state).toBe('open');
    expect(Math.hypot(drone.position.x - ATLASSIAN_GATE.x, drone.position.z - ATLASSIAN_GATE.z)).toBeLessThan(1e-6);
    expect(events).toEqual(['mute:true', 'mute:false']);
    expect(drone.status).toBe('working');
  });
});
