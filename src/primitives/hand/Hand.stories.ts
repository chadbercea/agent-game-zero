import type { Meta, StoryObj } from '@storybook/html-vite';
import { specimenStage } from '../../stage/specimen';
import { tween, wait } from '../../story/timeline';
import { Hand, WAVE } from './Hand';

interface HandArgs {
  reach: number;
  grip: number;
}

const meta: Meta<HandArgs> = {
  title: 'Primitives/Hand',
  parameters: { layout: 'fullscreen' },
  argTypes: {
    reach: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    grip: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
  },
  args: { reach: 0.35, grip: 0.5 },
};
export default meta;

function handOn() {
  const { root, stage } = specimenStage({ viewSize: 3.5, focusY: 1.6 });
  const hand = new Hand();
  hand.position.y = 3;
  stage.add(hand);
  return { root, stage, hand };
}

/** One hand: set its reach and grip. */
export const Specimen: StoryObj<HandArgs> = {
  render: (args) => {
    const { root, hand } = handOn();
    hand.reach = args.reach;
    hand.grip = args.grip;
    return root;
  },
};

/** Reach down, grip, let go, wave, pull back up. Loops. */
export const ReachGripWave: StoryObj = {
  render: () => {
    const { root, stage, hand } = handOn();
    void (async () => {
      for (;;) {
        hand.grip = 1;
        await tween(stage, 1.2, (t) => (hand.reach = 0.45 * t));
        await wait(stage, 0.4);
        await tween(stage, 0.35, (t) => (hand.grip = 1 - t));
        await tween(stage, 1.1, (t) => (hand.wave = Math.sin(t * Math.PI * 4) * WAVE));
        hand.wave = 0;
        await tween(stage, 0.7, (t) => (hand.reach = 0.45 * (1 - t)));
        await wait(stage, 0.8);
      }
    })();
    return root;
  },
};
