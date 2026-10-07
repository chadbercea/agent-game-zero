import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../../stage/specimen';
import { tween, wait } from '../../story/timeline';
import { PhoneCall } from './PhoneCall';

const meta: Meta = {
  title: 'Primitives/Phone Call',
  parameters: { layout: 'fullscreen' },
};
export default meta;

/** A handset ringing: the sound arcs pulse out from the earpiece and the handset jiggles. Quiet, then ringing, on loop. */
export const Ringing: StoryObj = {
  render: () => {
    const { root, stage } = specimenStage({ viewSize: 1.6, focusY: 0.1 });
    const phone = new PhoneCall();
    phone.scale.setScalar(1.4);
    stage.add(phone);
    stage.onTick((dt) => phone.update(dt));
    void (async () => {
      for (;;) {
        phone.ringing = 0;
        await wait(stage, 1);
        await tween(stage, 0.3, (t) => (phone.ringing = t));
        await wait(stage, 3);
      }
    })();
    return root;
  },
};
