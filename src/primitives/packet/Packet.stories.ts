import type { Meta, StoryObj } from '@storybook/html-vite';
import { sendPacket } from '../../stage/sendPacket';
import { type SpawnedAgent, spawnAgent } from '../../stage/spawnAgent';
import { rowPosition, specimenStage } from '../../stage/specimen';

interface PacketArgs {
  speed: number;
  lift: number;
}

const meta: Meta<PacketArgs> = {
  title: 'Primitives/Packet',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    speed: { control: { type: 'range', min: 0.5, max: 8, step: 0.25 } },
    lift: { control: { type: 'range', min: 0, max: 3, step: 0.1 } },
  },
  args: { speed: 3.2, lift: 0.9 },
};
export default meta;

type Story = StoryObj<PacketArgs>;

/** Two agents passing packets back and forth. */
export const Relay: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 6, focusY: 1.5 });
    const ends = [0, 1].map((i) => {
      const { x, z } = rowPosition(i, 2, 4.5);
      return spawnAgent(stage, x, z, { status: 'working' });
    });
    let direction = 0;
    const loop = async (): Promise<void> => {
      await sendPacket(stage, ends[direction], ends[1 - direction], args).landed;
      direction = 1 - direction;
      void loop();
    };
    void loop();
    return root;
  },
};

/** A parent exchanging lineage packets with its sub-agents. */
export const Family: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 9, focusY: 1.2 });
    const parent = spawnAgent(stage, 0, 0, { status: 'working', name: 'D3V1N', showLabel: true });
    // Sub-agents to the screen-right, screen-left and behind, never in front of the parent.
    const subs: SpawnedAgent[] = [
      [3.2, -3.2],
      [-3.2, 3.2],
      [-3, -3],
    ].map(([x, z], i) =>
      spawnAgent(stage, x, z, { status: i === 2 ? 'waiting' : 'working', subAgent: true }),
    );
    let clock = 0;
    stage.onTick((dt) => {
      clock += dt;
      if (clock < 0.6) return;
      clock = 0;
      const sub = subs[Math.floor(Math.random() * subs.length)];
      const outbound = Math.random() < 0.5;
      void sendPacket(stage, outbound ? parent : sub, outbound ? sub : parent, args);
    });
    return root;
  },
};
