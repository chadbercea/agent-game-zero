import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../../stage/specimen';
import { wait, tween } from '../../story/timeline';
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

/** One cloud, bobbing and breathing. */
export const Specimen: StoryObj = {
  render: () => cloudOn().root,
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
