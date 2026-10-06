import type { Meta, StoryObj } from '@storybook/html-vite';
import { attachSignal } from '../stage/attachSignal';
import { Vector3 } from 'three';
import { GateAnimator } from '../animation/GateAnimator';
import { Gate } from '../primitives/gate/Gate';
import { spawnDrone } from '../stage/spawnDrone';
import { specimenStage } from '../stage/specimen';
import type { Stage } from '../stage/Stage';
import { accessCheck } from './accessCheck';
import { leaveBase } from './leaveBase';
import { wait } from './timeline';

interface CheckArgs {
  /** Does the system behind the gate work as expected? */
  works: boolean;
}

const meta: Meta<CheckArgs> = {
  title: 'Story/03 Access Check',
  parameters: { layout: 'fullscreen' },
  args: { works: true },
};
export default meta;

type Story = StoryObj<CheckArgs>;

const HOME = new Vector3(-3.4, 0, 2.2);

function scene(stage: Stage, works: boolean) {
  const gate = new Gate({ works });
  const gateAnimator = new GateAnimator(gate);
  stage.add(gate);
  stage.onTick((dt) => gateAnimator.update(dt));
  const { drone } = spawnDrone(stage, HOME.x, HOME.z, { name: 'D3V1N', showLabel: true, status: 'waiting' });
  const signal = attachSignal(stage, drone, gate);
  return { gate, drone, signal };
}

/**
 * A drone flies to a gray gate; the gate thinks (yellow, sweeping), then pops
 * green or red. Loops: the drone flies home and tries again. Toggle `works`.
 */
export const Check: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 7, focusY: 0.6 });
    const { gate, drone, signal } = scene(stage, args.works);
    void (async () => {
      for (;;) {
        await wait(stage, 1);
        await accessCheck(stage, drone, gate);
        await wait(stage, 2.5);
        await leaveBase(stage, { drone, gate, signal }, HOME);
      }
    })();
    return root;
  },
};

/** Denied, the system gets fixed, retry, access granted. */
export const Retry: Story = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 7, focusY: 0.6 });
    const { gate, drone, signal } = scene(stage, false);
    void (async () => {
      for (;;) {
        gate.works = false;
        await wait(stage, 1);
        await accessCheck(stage, drone, gate); // red: drone Stopped at the gate
        await wait(stage, 2.5);
        gate.works = true;
        await accessCheck(stage, drone, gate); // retry: green
        await wait(stage, 2.5);
        await leaveBase(stage, { drone, gate, signal }, HOME);
      }
    })();
    return root;
  },
};
