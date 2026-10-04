import type { Meta, StoryObj } from '@storybook/html-vite';
import { LINEAGES, type Lineage, STATUSES, type Status } from '../core/palette';
import { spawnAgent } from './spawnAgent';
import { rowPosition, specimenStage } from './specimen';

interface AgentArgs {
  status: Status;
  lineage: Lineage;
  subAgent: boolean;
  showLabel: boolean;
  name: string;
}

const meta: Meta<AgentArgs> = {
  title: 'Composites/Agent',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    status: { control: 'inline-radio', options: STATUSES },
    lineage: { control: 'select', options: LINEAGES },
  },
  args: { status: 'working', lineage: 'blue', subAgent: false, showLabel: false, name: 'D3V1N' },
};
export default meta;

type Story = StoryObj<AgentArgs>;

/** A drone hovering over its task. Status flows from the drone to the task. */
export const Specimen: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 4.6, focusY: 1.3 });
    spawnAgent(stage, 0, 0, args);
    return root;
  },
};

/** The reference's top row: Problem / Stopped · Idle / Waiting · Working. */
export const StatusTrio: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 5.4, focusY: 1.2 });
    STATUSES.forEach((status, i) => {
      const { x, z } = rowPosition(i, STATUSES.length, 3.4);
      spawnAgent(stage, x, z, { ...args, status, name: status });
    });
    return root;
  },
};

/** One agent stepping through every status, drone and task together. */
export const Transitions: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 4.6, focusY: 1.3 });
    const { drone } = spawnAgent(stage, 0, 0, args);
    let clock = 0;
    let index = STATUSES.indexOf(args.status);
    stage.onTick((dt) => {
      clock += dt;
      if (clock < 3) return;
      clock = 0;
      index = (index + 1) % STATUSES.length;
      drone.status = STATUSES[index];
    });
    return root;
  },
};
