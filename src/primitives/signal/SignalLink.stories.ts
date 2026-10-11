import type { Meta, StoryObj } from '@storybook/html-vite';
import { GateAnimator } from '../../animation/GateAnimator';
import type { Status } from '../../core/palette';
import { Gate, type GateState } from '../gate/Gate';
import { attachSignal } from '../../stage/attachSignal';
import { FACE_CAMERA, spawnDrone } from '../../stage/spawnDrone';
import { rowPosition, specimenStage } from '../../stage/specimen';
import type { Stage } from '../../stage/Stage';
import type { Drone } from '../drone/Drone';

const meta: Meta = {
  title: 'Primitives/Signal Link',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** The gate's lights for each drone status, as Rovo's gate shows them. */
const GATE_FOR_STATUS: Record<Status, GateState> = { working: 'open', waiting: 'off', stopped: 'denied' };

/** A drone over its gate, linked the way Rovo is linked to its gate in the story. */
function droneOnGate(stage: Stage, x: number, z: number, status: Status, name: string): Drone {
  const gate = new Gate({ state: GATE_FOR_STATUS[status] });
  gate.position.set(x, 0, z);
  gate.rotation.y = FACE_CAMERA;
  stage.add(gate);
  const gateAnimator = new GateAnimator(gate);
  const { drone } = spawnDrone(stage, x, z, { status, name, showLabel: true });
  stage.onTick((dt) => {
    gate.state = GATE_FOR_STATUS[drone.status];
    gateAnimator.update(dt);
  });
  attachSignal(stage, drone, gate);
  return drone;
}

/**
 * The drone ↔ gate link in each state. Working: green rises while gray falls,
 * a two-way conversation. Waiting: quiet. Stopped: one shot of five dots that
 * turn red as they sink into the gate, then nothing. (Stopped fires once when
 * the story loads; see Transitions to watch it repeat.)
 */
export const States: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 5.4, focusY: 1.2 });
    const order: Status[] = ['working', 'waiting', 'stopped'];
    order.forEach((status, i) => {
      const { x, z } = rowPosition(i, order.length, 3.4);
      droneOnGate(stage, x, z, status, status);
    });
    return root;
  },
};

/** One drone cycling working → waiting → stopped, so each state's link plays in turn. */
export const Transitions: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 4.6, focusY: 1.3 });
    const drone = droneOnGate(stage, 0, 0, 'working', 'Rovo');
    const cycle: Status[] = ['working', 'waiting', 'stopped'];
    let index = 0;
    let clock = 0;
    stage.onTick((dt) => {
      clock += dt;
      if (clock < 3.5) return;
      clock = 0;
      index = (index + 1) % cycle.length;
      drone.status = cycle[index];
    });
    return root;
  },
};
