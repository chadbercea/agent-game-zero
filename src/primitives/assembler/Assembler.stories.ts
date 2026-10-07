import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../../stage/specimen';
import { wait } from '../../story/timeline';
import { Assembler } from './Assembler';

const meta: Meta = {
  title: 'Primitives/Assembler',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** Little blocks click in one by one; at eight they fuse into a bigger block, which is taken away. Loops. */
export const Build: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 1.8, focusY: 0.3 });
    const assembler = new Assembler();
    stage.add(assembler);
    stage.onTick((dt) => assembler.update(dt));
    void (async () => {
      for (;;) {
        for (let i = 0; i < 8; i++) {
          await wait(stage, 0.4);
          assembler.addBlock();
        }
        await wait(stage, 1.6);
        assembler.take()?.removeFromParent();
        await wait(stage, 0.6);
      }
    })();
    return root;
  },
};
