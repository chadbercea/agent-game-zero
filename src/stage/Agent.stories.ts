import type { Meta, StoryObj } from '@storybook/html-vite';
import { LINEAGES, type Lineage, STATUSES, type Status } from '../core/palette';
import { Population } from './Population';
import { type SpawnedAgent, spawnAgent } from './spawnAgent';
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

/** A drone hovering over its gate. The gate reads the drone: working = open, waiting = off, stopped = denied. */
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

/** One agent stepping through every status, drone and gate together. */
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

/**
 * Arrivals on demand: sub-agents emerge from D3V1N, top-level agents descend.
 * With "Detail" on, the parent → child connection draws out with each child.
 */
export const Spawn: Story = {
  args: { showLabel: true },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 11, focusY: 0.8 });
    const population = new Population(stage);
    const parent = population.spawn(0, 0, { ...args, status: 'working' });
    const subSpots = [[3.4, -1.6], [-1.6, 3.4], [-3.4, -1.6], [1.6, 3.4]];
    const rootSpots = [[5.5, 3], [-5, -4], [4.5, -5.5], [-5.5, 4.5]];
    const subs: SpawnedAgent[] = [];
    const roots: SpawnedAgent[] = [];

    const spawnSub = () => {
      if (subs.length === subSpots.length) population.despawn(subs.shift()!);
      const used = new Set(subs.map((a) => `${a.unit.position.x},${a.unit.position.z}`));
      const [x, z] = subSpots.find(([sx, sz]) => !used.has(`${sx},${sz}`))!;
      subs.push(population.spawn(x, z, { parent, status: 'working', name: `${args.name}.${subs.length + 1}` }));
    };
    const spawnRoot = () => {
      if (roots.length === rootSpots.length) population.despawn(roots.shift()!);
      const used = new Set(roots.map((a) => `${a.unit.position.x},${a.unit.position.z}`));
      const [x, z] = rootSpots.find(([sx, sz]) => !used.has(`${sx},${sz}`))!;
      roots.push(population.spawn(x, z, { status: 'waiting' }));
    };

    const bar = document.createElement('div');
    Object.assign(bar.style, { position: 'absolute', top: '12px', left: '12px', display: 'flex', gap: '8px', zIndex: '1' });
    const button = (label: string, onClick: () => void) => {
      const el = document.createElement('button');
      el.textContent = label;
      el.onclick = onClick;
      Object.assign(el.style, { font: '13px system-ui, sans-serif', padding: '6px 10px', cursor: 'pointer' });
      bar.append(el);
      return el;
    };
    button('Spawn sub-agent', spawnSub);
    button('Spawn top-level agent', spawnRoot);
    const detail = button('Detail: off', () => {
      const on = population.focusedAgent === undefined;
      population.focus(on ? parent : undefined);
      detail.textContent = `Detail: ${on ? 'on' : 'off'}`;
    });
    root.append(bar);

    spawnSub();
    return root;
  },
};
