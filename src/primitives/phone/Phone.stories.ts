import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../../stage/specimen';
import { wait } from '../../story/timeline';
import { Phone } from './Phone';

const meta: Meta = {
  title: 'Primitives/Phone',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** The on-call person's phone: at rest, paged (red, buzzing), acked (green). Loops. */
export const PagedAndAcked: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 1.8, focusY: 0.45 });
    const phone = new Phone();
    stage.add(phone);
    stage.onTick((dt) => phone.update(dt));
    void (async () => {
      for (;;) {
        await wait(stage, 1.2);
        phone.page();
        await wait(stage, 2);
        phone.ack();
        await wait(stage, 1.5);
        phone.rest();
      }
    })();
    return root;
  },
};
