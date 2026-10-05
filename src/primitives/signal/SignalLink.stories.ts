import type { Meta, StoryObj } from '@storybook/html-vite';
import type { Status } from '../../core/palette';
import { spawnAgent } from '../../stage/spawnAgent';
import { rowPosition, specimenStage } from '../../stage/specimen';

const meta: Meta = {
  title: 'Primitives/Signal Link',
  parameters: { layout: 'fullscreen' },
};
export default meta;

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
      spawnAgent(stage, x, z, { status, name: status, showLabel: true });
    });
    return root;
  },
};

/** One agent cycling working → waiting → stopped, so each state's link plays in turn. */
export const Transitions: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 4.6, focusY: 1.3 });
    const { drone } = spawnAgent(stage, 0, 0, { status: 'working', name: 'D3V1N', showLabel: true });
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
