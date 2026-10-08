import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../../stage/specimen';
import { cloudDrop } from '../../story/cloudDrop';
import { tween, wait } from '../../story/timeline';
import { SystemNode } from '../node/SystemNode';
import { Ticket } from '../ticket/Ticket';
import { Cloud } from './Cloud';

const meta: Meta = {
  title: 'Primitives/Cloud',
  parameters: { layout: 'fullscreen' },
};
export default meta;

function cloudOn(viewSize = 4) {
  const { root, stage } = specimenStage({ viewSize, focusY: 1.2 });
  const cloud = new Cloud();
  cloud.position.y = 1.2;
  stage.add(cloud);
  stage.onTick((dt) => cloud.update(dt));
  return { root, stage, cloud };
}

/** One cloud, bobbing and breathing. The control sets `materialized` (0–1): how far its puffs have popped in. */
export const Specimen: StoryObj<{ materialized: number }> = {
  argTypes: { materialized: { control: { type: 'range', min: 0, max: 1, step: 0.01 } } },
  args: { materialized: 1 },
  render: (args) => {
    const { root, cloud } = cloudOn();
    cloud.materialized = args.materialized;
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
