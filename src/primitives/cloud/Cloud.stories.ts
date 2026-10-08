import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../../stage/specimen';
import { cloudDrop } from '../../story/cloudDrop';
import { tween, wait } from '../../story/timeline';
import { SystemNode } from '../node/SystemNode';
import { Ticket } from '../ticket/Ticket';
import { rowPosition } from '../../stage/specimen';
import { Cloud, CLOUD_SHAPE_NAMES, CLOUD_SHAPES } from './Cloud';

const meta: Meta = {
  title: 'Primitives/Cloud',
  parameters: { layout: 'fullscreen' },
};
export default meta;

function cloudOn(viewSize = 4, shape = 0) {
  const { root, stage } = specimenStage({ viewSize, focusY: 1.2 });
  const cloud = new Cloud({ shape });
  cloud.position.y = 1.2;
  stage.add(cloud);
  stage.onTick((dt) => cloud.update(dt));
  return { root, stage, cloud };
}

/**
 * One cloud, bobbing and breathing. Controls: `shape` (which of the five
 * shapes; in the story each cloud gets one by seeded RNG) and `materialized`
 * (0–1: how far its puffs have popped in).
 */
export const Specimen: StoryObj<{ shape: (typeof CLOUD_SHAPE_NAMES)[number]; materialized: number }> = {
  argTypes: {
    shape: { control: 'inline-radio', options: CLOUD_SHAPE_NAMES },
    materialized: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
  },
  args: { shape: 'classic', materialized: 1 },
  render: (args) => {
    const { root, cloud } = cloudOn(4.5, CLOUD_SHAPE_NAMES.indexOf(args.shape));
    cloud.materialized = args.materialized;
    return root;
  },
};

/** All five shapes side by side, materializing and vanishing together: same behavior, different silhouettes. */
export const Shapes: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 8, focusY: 1.2 });
    const clouds = CLOUD_SHAPES.map((_, i) => {
      const cloud = new Cloud({ shape: i });
      const { x, z } = rowPosition(i, CLOUD_SHAPES.length, 2.7);
      cloud.position.set(x, 1.2, z);
      cloud.scale.setScalar(0.7);
      stage.add(cloud);
      return cloud;
    });
    stage.onTick((dt) => clouds.forEach((c) => c.update(dt)));
    void (async () => {
      for (;;) {
        await tween(stage, 1.1, (t) => clouds.forEach((c) => (c.materialized = t)));
        await wait(stage, 2.5);
        await tween(stage, 0.8, (t) => clouds.forEach((c) => (c.materialized = 1 - t)));
        await wait(stage, 0.6);
      }
    })();
    return root;
  },
};

/** Materialize and vanish on loop: the puffs pop in middle-first, then pop away. */
export const Materialize: StoryObj = {
  render: () => {
    const { root, stage, cloud } = cloudOn();
    void (async () => {
      for (;;) {
        await tween(stage, 1.1, (t) => (cloud.materialized = t));
        await wait(stage, 1.5);
        await tween(stage, 0.8, (t) => (cloud.materialized = 1 - t));
        await wait(stage, 0.8);
      }
    })();
    return root;
  },
};

/** A cloud drifts across, drops a ticket onto Jira as it passes over, and drifts on; the ticket is taken in. Loops. */
export const DriftAndDrop: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 7, focusY: 1.2 });
    const jira = new SystemNode({ kind: 'jira' });
    stage.add(jira);
    const cloud = new Cloud();
    const ticket = new Ticket(undefined, { label: false });
    ticket.scale.setScalar(0.38);
    stage.add(cloud, ticket);
    stage.onTick((dt) => {
      cloud.update(dt);
      ticket.update(dt);
    });
    void (async () => {
      for (;;) {
        await cloudDrop(stage, cloud, ticket, jira.position, { height: 3, tilt: 0.15 });
        await wait(stage, 1);
      }
    })();
    return root;
  },
};
