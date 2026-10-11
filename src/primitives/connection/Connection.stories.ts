import type { Meta, StoryObj } from '@storybook/html-vite';
import { ConnectionReveal } from '../../animation/ConnectionReveal';
import { spawnDrone } from '../../stage/spawnDrone';
import { specimenStage } from '../../stage/specimen';
import { SUB_AGENT_SCALE } from '../drone/Drone';
import { Connection } from './Connection';

interface ConnectionArgs {
  /** Drawn on from Rovo, or retracted back toward it. */
  shown: boolean;
}

const meta: Meta<ConnectionArgs> = {
  title: 'Primitives/Connection',
  parameters: { layout: 'fullscreen' },
  argTypes: { shown: { control: 'boolean' } },
  args: { shown: true },
};
export default meta;

/**
 * Connection: the dotted line from Rovo to each of its copies, in their
 * lineage color, as the drone family tree draws it. `shown` draws the lines
 * on from Rovo, or retracts them toward it.
 */
export const Specimen: StoryObj<ConnectionArgs> = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 6, focusY: 1.2 });
    const { drone: rovo } = spawnDrone(stage, 0, 1.2, { name: 'Rovo', lineage: 'cyan', showLabel: true, status: 'working' });
    const reveals = [
      [-1.8, -0.8],
      [1.8, -0.8],
    ].map(([x, z]) => {
      const { drone: copy } = spawnDrone(stage, x, z, { lineage: 'cyan', status: 'working' });
      copy.scale.setScalar(SUB_AGENT_SCALE);
      const connection = new Connection('cyan');
      stage.add(connection);
      const reveal = new ConnectionReveal(connection, rovo.rig.hover, copy.rig.hover);
      reveal.shown = args.shown;
      return reveal;
    });
    stage.onTick((dt) => reveals.forEach((reveal) => reveal.update(dt)));
    return root;
  },
};
