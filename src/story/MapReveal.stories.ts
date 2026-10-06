import type { Meta, StoryObj } from '@storybook/html-vite';
import { attachSignal } from '../stage/attachSignal';
import { Vector3 } from 'three';
import { GateAnimator } from '../animation/GateAnimator';
import { Gate } from '../primitives/gate/Gate';
import { JOB_KINDS } from '../primitives/node/emblems';
import { spawnDrone } from '../stage/spawnDrone';
import { specimenStage } from '../stage/specimen';
import { accessCheck } from './accessCheck';
import { hoverLines } from './hoverLines';
import { revealMap } from './revealMap';
import { SystemMap } from './SystemMap';
import { leaveBase } from './leaveBase';
import { wait } from './timeline';

interface RevealArgs {
  works: boolean;
}

const meta: Meta<RevealArgs> = {
  title: 'Story/04 Map Reveal',
  parameters: { layout: 'fullscreen' },
  args: { works: true },
};
export default meta;

type Story = StoryObj<RevealArgs>;

/**
 * Access check, then on green the system maps out: branches draw from the
 * gate, Figma / GitHub / Notion rise as their branch arrives, the lines
 * linger and fade. Hover the gate or a node to see the lines again; click to
 * pin them. On red, nothing is revealed.
 */
export const Reveal: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 13, focusY: 0 });
    const gate = new Gate({ works: args.works });
    gate.position.set(2, 0, 2);
    const gateAnimator = new GateAnimator(gate);
    stage.add(gate);
    stage.onTick((dt) => gateAnimator.update(dt));
    const map = new SystemMap(stage, gate, JOB_KINDS);
    hoverLines(stage, map);

    const home = new Vector3(-1.8, 0, 5);
    const { drone } = spawnDrone(stage, home.x, home.z, { name: 'D3V1N', showLabel: true, status: 'waiting' });
    const signal = attachSignal(stage, drone, gate);
    void (async () => {
      for (;;) {
        await wait(stage, 1);
        if (await accessCheck(stage, drone, gate)) await revealMap(stage, map);
        await wait(stage, 5);
        map.hide();
        await leaveBase(stage, { drone, gate, signal }, home);
      }
    })();
    return root;
  },
};
