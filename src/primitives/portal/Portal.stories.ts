import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../../stage/specimen';
import { tween, wait } from '../../story/timeline';
import { Portal } from './Portal';

const meta: Meta = {
  title: 'Primitives/Portal',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** Opens, swirls, gulps a few times (something going through), closes. Loops. */
export const OpenAndGulp: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 3, focusY: 0.9 });
    const portal = new Portal();
    stage.add(portal);
    stage.onTick((dt) => portal.update(dt));
    void (async () => {
      for (;;) {
        await tween(stage, 0.8, (t) => (portal.open = t));
        for (let i = 0; i < 3; i++) {
          await wait(stage, 1.2);
          portal.gulp();
        }
        await wait(stage, 1.2);
        await tween(stage, 0.6, (t) => (portal.open = 1 - t));
        await wait(stage, 0.8);
      }
    })();
    return root;
  },
};
