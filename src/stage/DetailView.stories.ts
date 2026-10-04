import type { Meta, StoryObj } from '@storybook/html-vite';
import { STATUSES, type Status } from '../core/palette';
import { Population } from './Population';
import type { SpawnedAgent } from './spawnAgent';
import { specimenStage } from './specimen';

interface DetailArgs {
  /** Seconds per focus step; 0 holds the first lineage in Detail. */
  cycle: number;
}

const meta: Meta<DetailArgs> = {
  title: 'Composites/Detail View',
  parameters: { layout: 'fullscreen' },
  argTypes: { cycle: { control: { type: 'range', min: 0, max: 8, step: 0.5 } } },
  args: { cycle: 3.5 },
};
export default meta;

type Story = StoryObj<DetailArgs>;

/**
 * Two lineages plus independents changing status (packets follow). Focus steps
 * Runtime → family A → Runtime → family B: the focused lineage stays at 100%,
 * its connections draw in, and everything else fades to 10%.
 */
export const LineageFocus: Story = {
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 14, focusY: 0.6 });
    const population = new Population(stage);
    const at = (x: number, z: number, status: Status, name: string, parent?: SpawnedAgent) =>
      population.spawn(x, z, { status, name, parent, showLabel: true });

    const devin = at(0, 0, 'working', 'D3V1N');
    at(4, -3, 'working', 'D3V1N.1', devin);
    at(-3, 4, 'waiting', 'D3V1N.2', devin);
    at(4.5, 2, 'working', 'D3V1N.3', devin);
    const ada = at(-6, -5, 'waiting', 'ADA');
    at(-9, -1, 'stopped', 'ADA.1', ada);
    at(-2, -8.5, 'working', 'ADA.2', ada);
    at(7, -8, 'stopped', 'LINUS');
    at(-8, 7, 'working', 'GRACE');
    at(8.5, 7, 'waiting', 'KEN');
    for (const agent of population.agents) agent.drone.labelVisible = !population.parentOf(agent);

    let changes = 0;
    let clock = 0;
    let step = 0;
    const steps = [undefined, devin, undefined, ada];
    if (args.cycle === 0) population.focus(devin);
    stage.onTick((dt) => {
      changes += dt;
      if (changes > 0.5) {
        changes = 0;
        const agents = population.agents;
        const agent = agents[Math.floor(Math.random() * agents.length)];
        const others = STATUSES.filter((s) => s !== agent.drone.status);
        agent.drone.status = others[Math.floor(Math.random() * others.length)];
      }
      if (args.cycle === 0) return;
      clock += dt;
      if (clock < args.cycle) return;
      clock = 0;
      step = (step + 1) % steps.length;
      population.focus(steps[step]);
    });
    return root;
  },
};
