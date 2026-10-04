import type { Meta, StoryObj } from '@storybook/html-vite';
import { LINEAGES, type Lineage, STATUSES, type Status } from '../../core/palette';
import { rowPosition, specimenStage } from '../../stage/specimen';
import { spawnDrone } from '../../stage/spawnDrone';

interface DroneArgs {
  status: Status;
  lineage: Lineage;
  subAgent: boolean;
  showLabel: boolean;
  name: string;
}

const meta: Meta<DroneArgs> = {
  title: 'Primitives/Drone',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    status: { control: 'inline-radio', options: STATUSES },
    lineage: { control: 'select', options: LINEAGES },
  },
  args: { status: 'working', lineage: 'blue', subAgent: false, showLabel: true, name: 'D3V1N' },
};
export default meta;

type Story = StoryObj<DroneArgs>;

/** One drone, close up. Every prop is a control. */
export const Specimen: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 4.2, focusY: 2.1 });
    spawnDrone(stage, 0, 0, args);
    return root;
  },
};

/** Problem / Stopped · Idle / Waiting · Working, side by side as in the reference. */
export const StatusTrio: Story = {
  args: { showLabel: false },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 5.5, focusY: 2.0 });
    STATUSES.forEach((status, i) => {
      const { x, z } = rowPosition(i, STATUSES.length, 3.4);
      spawnDrone(stage, x, z, { ...args, status, name: status });
    });
    return root;
  },
};

/** Lineage palette on the shared body. Status stays on the lens; lineage on the feet. */
export const Lineages: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 6, focusY: 2.0 });
    LINEAGES.forEach((lineage, i) => {
      const { x, z } = rowPosition(i, LINEAGES.length, 2.9);
      spawnDrone(stage, x, z, { ...args, lineage, name: lineage });
    });
    return root;
  },
};

/** A parent and its sub-agents: same lineage, smaller body. */
export const ParentAndSubAgents: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 7, focusY: 1.4 });
    spawnDrone(stage, 0, 0, args);
    const subs: { x: number; z: number; status: Status }[] = [
      { x: 2.4, z: -1.4, status: 'working' },
      { x: 2.2, z: 1.8, status: 'waiting' },
      { x: -1.6, z: 2.4, status: 'stopped' },
    ];
    subs.forEach(({ x, z, status }, i) =>
      spawnDrone(stage, x, z, { ...args, status, subAgent: true, name: `${args.name}.${i + 1}` }),
    );
    return root;
  },
};
