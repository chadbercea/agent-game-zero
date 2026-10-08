import type { Meta, StoryObj } from '@storybook/html-vite';
import { spawnDrone } from '../../stage/spawnDrone';
import { specimenStage } from '../../stage/specimen';
import { tween, wait } from '../../story/timeline';
import { GRAPH_COLOR } from '../graph/GraphEdge';
import { Charge } from './Charge';

const meta: Meta = {
  title: 'Primitives/Charge',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** An agent charging up: off, then the ring comes in with a burst and keeps orbiting. Loops. */
export const PowerUp: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 3.2, focusY: 2.1 });
    const { drone } = spawnDrone(stage, 0, 0, { name: 'D3V1N', showLabel: true, status: 'working' });
    const charge = new Charge(GRAPH_COLOR);
    drone.rig.hover.add(charge);
    stage.onTick((dt) => charge.update(dt));
    void (async () => {
      for (;;) {
        charge.level = 0;
        await wait(stage, 1.2);
        await tween(stage, 0.8, (t) => (charge.level = t));
        charge.burst();
        drone.flash = 1;
        await wait(stage, 3.5);
      }
    })();
    return root;
  },
};

/**
 * Charge on a drone, under control: `level` (0–1) sets how charged the ring
 * is; `burstEvery` calls `burst()` on a timer (0 = never).
 */
export const Specimen: StoryObj<{ level: number; burstEvery: number }> = {
  argTypes: { level: { control: { type: 'range', min: 0, max: 1, step: 0.01 } }, burstEvery: { control: { type: 'range', min: 0, max: 5, step: 0.5 } } },
  args: { level: 1, burstEvery: 2 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 3.2, focusY: 2.1 });
    const { drone } = spawnDrone(stage, 0, 0, { name: 'D3V1N', showLabel: true, status: 'working' });
    const charge = new Charge(GRAPH_COLOR);
    charge.level = args.level;
    drone.rig.hover.add(charge);
    let since = 0;
    stage.onTick((dt) => {
      charge.update(dt);
      if (!args.burstEvery) return;
      since += dt;
      if (since < args.burstEvery) return;
      since = 0;
      charge.burst();
    });
    return root;
  },
};
