import type { Meta, StoryObj } from '@storybook/html-vite';
import { FACE_CAMERA } from '../../core/grid';
import { specimenStage } from '../../stage/specimen';
import { tween, wait } from '../../story/timeline';
import { Flag } from './Flag';

const meta: Meta = {
  title: 'Primitives/Flag',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** A feature flag: on (banner up), turned off (it lowers), back on. Loops. */
export const OnAndOff: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 1.6, focusY: 0.35 });
    const flag = new Flag();
    flag.rotation.y = FACE_CAMERA;
    stage.add(flag);
    void (async () => {
      for (;;) {
        await wait(stage, 1.2);
        await tween(stage, 0.6, (t) => (flag.raised = 1 - t));
        await wait(stage, 1.2);
        await tween(stage, 0.6, (t) => (flag.raised = t));
      }
    })();
    return root;
  },
};
