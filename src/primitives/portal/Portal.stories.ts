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

/**
 * Portal under control: `open` (0–1) sets how far the ring has opened;
 * `gulpEvery` calls `gulp()` on a timer (0 = never), as when something goes
 * through.
 */
export const Specimen: StoryObj<{ open: number; gulpEvery: number }> = {
  argTypes: { open: { control: { type: 'range', min: 0, max: 1, step: 0.01 } }, gulpEvery: { control: { type: 'range', min: 0, max: 5, step: 0.5 } } },
  args: { open: 1, gulpEvery: 1.5 },
  render: (args) => {
    const { root, stage } = specimenStage({ viewSize: 3, focusY: 0.9 });
    const portal = new Portal();
    portal.open = args.open;
    stage.add(portal);
    let since = 0;
    stage.onTick((dt) => {
      portal.update(dt);
      if (!args.gulpEvery) return;
      since += dt;
      if (since < args.gulpEvery) return;
      since = 0;
      portal.gulp();
    });
    return root;
  },
};
